import { Injectable, NotFoundException } from '@nestjs/common';
import { UrbanexPrismaService } from '../prisma/urbanex-prisma.service';

export interface OwnerAiHistoryResponse {
  days: number;
  limit: number;
  items: Array<{
    log_id: string;
    endpoint: string;
    city: string | null;
    district: string | null;
    property_type: string | null;
    area_m2: number | null;
    fx_used: number | null;
    confidence: number | null;
    created_at: string;
    outcome: {
      action: string;
      final_price_syp: string;
      created_at: string;
    } | null;
  }>;
}

export interface OwnerAiHistoryDetailResponse {
  log: {
    log_id: string;
    endpoint: string;
    city: string | null;
    district: string | null;
    property_type: string | null;
    area_m2: number | null;
    fx_used: number | null;
    confidence: number | null;
    created_at: string;
  };
  outcome: {
    action: string;
    final_price_syp: string;
    created_at: string;
  } | null;
  request: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
}

@Injectable()
export class OwnerAiHistoryService {
  constructor(private readonly urbanexPrisma: UrbanexPrismaService) {}

  async getHistory(params: {
    ownerId: number;
    days: number;
    limit: number;
  }): Promise<OwnerAiHistoryResponse> {
    const from = new Date();
    from.setDate(from.getDate() - params.days);

    const logs = await this.urbanexPrisma.advisorRequestLog.findMany({
      where: {
        ownerId: params.ownerId,
        createdAt: { gte: from },
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit,
      select: {
        id: true,
        endpoint: true,
        cityNorm: true,
        districtNorm: true,
        propertyTypeNorm: true,
        areaM2: true,
        fxUsed: true,
        confidence: true,
        createdAt: true,
      },
    });

    const logIds = logs.map((row) => row.id.toString());
    const outcomesByLogId = new Map<
      string,
      {
        action: string;
        final_price_syp: string;
        created_at: string;
      }
    >();

    if (logIds.length > 0) {
      const outcomes = await this.urbanexPrisma.advisorOutcome.findMany({
        where: {
          logId: { in: logIds },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          logId: true,
          action: true,
          finalPriceSyp: true,
          createdAt: true,
        },
      });

      for (const row of outcomes) {
        if (outcomesByLogId.has(row.logId)) {
          continue;
        }
        outcomesByLogId.set(row.logId, {
          action: row.action,
          final_price_syp: row.finalPriceSyp.toString(),
          created_at: row.createdAt.toISOString(),
        });
      }
    }

    return {
      days: params.days,
      limit: params.limit,
      items: logs.map((row) => ({
        log_id: row.id.toString(),
        endpoint: row.endpoint,
        city: row.cityNorm ?? null,
        district: row.districtNorm ?? null,
        property_type: row.propertyTypeNorm ?? null,
        area_m2: row.areaM2 ?? null,
        fx_used: row.fxUsed ?? null,
        confidence: row.confidence ?? null,
        created_at: row.createdAt.toISOString(),
        outcome: outcomesByLogId.get(row.id.toString()) ?? null,
      })),
    };
  }

  async getHistoryDetail(params: {
    ownerId: number;
    logId: string;
  }): Promise<OwnerAiHistoryDetailResponse> {
    if (!/^\d+$/.test(params.logId)) {
      throw new NotFoundException('AI history item not found');
    }

    const log = (await this.urbanexPrisma.advisorRequestLog.findFirst({
      where: {
        id: BigInt(params.logId),
        ownerId: params.ownerId,
      },
      select: {
        id: true,
        endpoint: true,
        cityNorm: true,
        districtNorm: true,
        propertyTypeNorm: true,
        areaM2: true,
        fxUsed: true,
        confidence: true,
        requestJson: true,
        resultJson: true,
        createdAt: true,
      },
    })) as any;

    if (!log) {
      throw new NotFoundException('AI history item not found');
    }

    const outcome = await this.urbanexPrisma.advisorOutcome.findFirst({
      where: { logId: log.id.toString() },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        action: true,
        finalPriceSyp: true,
        createdAt: true,
      },
    });

    return {
      log: {
        log_id: log.id.toString(),
        endpoint: log.endpoint,
        city: log.cityNorm ?? null,
        district: log.districtNorm ?? null,
        property_type: log.propertyTypeNorm ?? null,
        area_m2: log.areaM2 ?? null,
        fx_used: log.fxUsed ?? null,
        confidence: log.confidence ?? null,
        created_at: log.createdAt.toISOString(),
      },
      outcome: outcome
        ? {
            action: outcome.action,
            final_price_syp: outcome.finalPriceSyp.toString(),
            created_at: outcome.createdAt.toISOString(),
          }
        : null,
      request: this.toRecord(log.requestJson),
      result: this.toRecord(log.resultJson),
    };
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}
