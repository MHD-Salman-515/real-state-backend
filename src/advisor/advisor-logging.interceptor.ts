import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';
import { Request, Response } from 'express';
import {
  AdvisorRequestLogPayload,
  AdvisorRequestLogService,
} from './advisor-request-log.service';
import { normalizeAreaInput } from './utils/area-normalization';

interface AdvisorResponseLike {
  citations?: {
    area_key?: string;
    sample_count?: number;
  };
  fx_used?: number;
  verdict?: string;
  confidence?: number;
  [key: string]: unknown;
}

@Injectable()
export class AdvisorLoggingInterceptor implements NestInterceptor {
  constructor(private readonly advisorRequestLogService: AdvisorRequestLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const startedAt = Date.now();
    const endpoint = request.route?.path
      ? `${request.method} ${request.baseUrl}${request.route.path}`
      : `${request.method} ${request.originalUrl}`;

    return next.handle().pipe(
      mergeMap((data: unknown) =>
        from(
          this.handleSuccess({
            request,
            endpoint,
            statusCode: response.statusCode,
            latencyMs: Date.now() - startedAt,
            data,
          }),
        ),
      ),
      catchError((error: unknown) => {
        const statusCode =
          error instanceof HttpException ? error.getStatus() : 500;
        const payload = this.buildPayload({
          request,
          endpoint,
          statusCode,
          latencyMs: Date.now() - startedAt,
        });
        void this.advisorRequestLogService.log(payload);
        return throwError(() => error);
      }),
    );
  }

  private async handleSuccess(params: {
    request: Request;
    endpoint: string;
    statusCode: number;
    latencyMs: number;
    data: unknown;
  }): Promise<unknown> {
    const payload = this.buildPayload(params);
    const logId = await this.advisorRequestLogService.log(payload);

    if (logId && this.shouldAttachLogId(params.endpoint, params.data)) {
      (params.data as Record<string, unknown>).log_id = logId;
    }

    return params.data;
  }

  private shouldAttachLogId(endpoint: string, data: unknown): data is Record<string, unknown> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return false;
    }

    return (
      endpoint === 'POST /advisor/seller-price' ||
      endpoint === 'POST /advisor/buyer-evaluate'
    );
  }

  private buildPayload(params: {
    request: Request;
    endpoint: string;
    statusCode: number;
    latencyMs: number;
    data?: unknown;
  }): AdvisorRequestLogPayload {
    const body = params.request.body as Record<string, unknown> | undefined;
    const requestWithUser = params.request as Request & {
      user?: { sub?: number | string; id?: number | string; role?: string };
    };
    const requestUser = requestWithUser.user as
      | { sub?: number | string; id?: number | string; role?: string }
      | undefined;
    const data = (params.data ?? {}) as AdvisorResponseLike;

    const normalizedArea = normalizeAreaInput({
      city: body?.city,
      district: body?.district,
      property_type: body?.property_type,
    });
    const city = normalizedArea.city_norm;
    const district = normalizedArea.district_norm;
    const propertyType = normalizedArea.property_type_norm;
    const areaM2 = this.normalizePositiveNumber(body?.area_m2);

    const areaKey =
      data.citations?.area_key ??
      (city && district && propertyType
        ? `${city}|${district}|${propertyType}`
        : undefined);

    return {
      endpoint: params.endpoint,
      owner_id: this.resolveOwnerId(requestUser),
      city_norm: city,
      district_norm: district,
      property_type_norm: propertyType,
      area_key: areaKey,
      area_m2: areaM2,
      sample_count: this.normalizeNonNegativeInteger(data.citations?.sample_count),
      fx_used: this.normalizePositiveNumber(data.fx_used),
      verdict: data.verdict,
      confidence: this.normalizeProbability(data.confidence),
      request_json: this.buildRequestSnapshot({
        city,
        district,
        propertyType,
        areaM2,
        askPriceSyp: this.normalizePositiveNumber(body?.ask_price_syp),
        proposedPriceSyp: this.normalizePositiveNumber(body?.proposed_price_syp),
      }),
      result_json: this.buildResultSnapshot(data),
      status_code: params.statusCode,
      latency_ms: Math.max(0, Math.round(params.latencyMs)),
    };
  }

  private buildRequestSnapshot(params: {
    city?: string;
    district?: string;
    propertyType?: string;
    areaM2?: number;
    askPriceSyp?: number;
    proposedPriceSyp?: number;
  }): Record<string, unknown> | undefined {
    const snapshot: Record<string, unknown> = {};
    if (params.city) snapshot.city = params.city;
    if (params.district) snapshot.district = params.district;
    if (params.propertyType) snapshot.property_type = params.propertyType;
    if (params.areaM2) snapshot.area_m2 = params.areaM2;
    if (params.askPriceSyp) snapshot.ask_price_syp = Math.round(params.askPriceSyp);
    if (params.proposedPriceSyp) {
      snapshot.proposed_price_syp = Math.round(params.proposedPriceSyp);
    }
    return Object.keys(snapshot).length ? snapshot : undefined;
  }

  private buildResultSnapshot(
    responseData: AdvisorResponseLike,
  ): Record<string, unknown> | undefined {
    if (!responseData || typeof responseData !== 'object' || Array.isArray(responseData)) {
      return undefined;
    }
    const snapshot = { ...responseData } as Record<string, unknown>;
    delete snapshot.log_id;
    return Object.keys(snapshot).length ? snapshot : undefined;
  }

  private resolveOwnerId(
    user?: { sub?: number | string; id?: number | string; role?: string },
  ): number | undefined {
    if (!user) {
      return undefined;
    }
    if (String(user.role || '').toUpperCase() !== 'OWNER') {
      return undefined;
    }

    const candidate = user.sub ?? user.id;
    const parsed = Number(candidate);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return undefined;
    }

    return parsed;
  }

  private normalizePositiveNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return undefined;
    }

    return parsed;
  }

  private normalizeNonNegativeInteger(value: unknown): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return undefined;
    }

    return Math.round(parsed);
  }

  private normalizeProbability(value: unknown): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      return undefined;
    }

    return parsed;
  }
}
