import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UrbanexPrismaService } from '../prisma/urbanex-prisma.service';

export interface AdvisorRequestLogPayload {
  endpoint: string;
  owner_id?: number;
  city_norm?: string;
  district_norm?: string;
  property_type_norm?: string;
  area_key?: string;
  area_m2?: number;
  sample_count?: number;
  fx_used?: number;
  verdict?: string;
  confidence?: number;
  request_json?: Record<string, unknown>;
  result_json?: Record<string, unknown>;
  status_code: number;
  latency_ms: number;
}

@Injectable()
export class AdvisorRequestLogService {
  private readonly logger = new Logger(AdvisorRequestLogService.name);

  constructor(private readonly urbanexPrisma: UrbanexPrismaService) {}

  async log(payload: AdvisorRequestLogPayload): Promise<string | undefined> {
    try {
      const data = {
        endpoint: payload.endpoint,
        ownerId: payload.owner_id ?? null,
        cityNorm: payload.city_norm ?? null,
        districtNorm: payload.district_norm ?? null,
        propertyTypeNorm: payload.property_type_norm ?? null,
        areaKey: payload.area_key ?? null,
        areaM2: payload.area_m2 ?? null,
        sampleCount: payload.sample_count ?? null,
        fxUsed: payload.fx_used ?? null,
        verdict: payload.verdict ?? null,
        confidence: payload.confidence ?? null,
        statusCode: payload.status_code,
        latencyMs: payload.latency_ms,
        ...(payload.request_json !== undefined
          ? { requestJson: payload.request_json as Prisma.InputJsonValue }
          : {}),
        ...(payload.result_json !== undefined
          ? { resultJson: payload.result_json as Prisma.InputJsonValue }
          : {}),
      };

      const row = await this.urbanexPrisma.advisorRequestLog.create({
        data: data as any,
      });

      return row.id.toString();
    } catch (error) {
      // Fallback keeps observability if DB logging is temporarily unavailable.
      this.logger.warn(
        `advisor_request_log_fallback ${JSON.stringify({
          ...payload,
          timestamp: new Date().toISOString(),
          reason: 'db_write_failed',
        })}`,
      );
      return undefined;
    }
  }
}
