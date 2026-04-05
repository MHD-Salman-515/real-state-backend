import { Injectable } from '@nestjs/common';
import { UrbanexPrismaService } from '../prisma/urbanex-prisma.service';

export interface AdminAdvisorAnalyticsResponse {
  days: number;
  totals: {
    suggestions: number;
    accepted_optimal: number;
    accepted_fast: number;
    edited: number;
    ignored: number;
  };
}

export interface AdminAdvisorExportRow {
  request_id: string;
  endpoint: string;
  city: string | null;
  district: string | null;
  property_type: string | null;
  area_m2: number | null;
  sample_count: number | null;
  fx_used: number | null;
  confidence: number | null;
  request_created_at: string;
  outcome_action: string | null;
  final_price_syp: string | null;
  outcome_created_at: string | null;
}

@Injectable()
export class AdminAdvisorService {
  constructor(private readonly urbanexPrisma: UrbanexPrismaService) {}

  async getAnalytics(days: number): Promise<AdminAdvisorAnalyticsResponse> {
    const from = new Date();
    from.setDate(from.getDate() - days);

    const [suggestions, acceptedOptimal, acceptedFast, edited, ignored] =
      await Promise.all([
        this.urbanexPrisma.advisorRequestLog.count({
          where: { createdAt: { gte: from } },
        }),
        this.urbanexPrisma.advisorOutcome.count({
          where: { createdAt: { gte: from }, action: 'accepted_optimal' },
        }),
        this.urbanexPrisma.advisorOutcome.count({
          where: { createdAt: { gte: from }, action: 'accepted_fast' },
        }),
        this.urbanexPrisma.advisorOutcome.count({
          where: { createdAt: { gte: from }, action: 'edited' },
        }),
        this.urbanexPrisma.advisorOutcome.count({
          where: { createdAt: { gte: from }, action: 'ignored' },
        }),
      ]);

    return {
      days,
      totals: {
        suggestions,
        accepted_optimal: acceptedOptimal,
        accepted_fast: acceptedFast,
        edited,
        ignored,
      },
    };
  }

  async getExport(days: number): Promise<AdminAdvisorExportRow[]> {
    const from = new Date();
    from.setDate(from.getDate() - days);

    const [requestLogs, outcomes] = await Promise.all([
      this.urbanexPrisma.advisorRequestLog.findMany({
        where: { createdAt: { gte: from } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          endpoint: true,
          cityNorm: true,
          districtNorm: true,
          propertyTypeNorm: true,
          areaM2: true,
          sampleCount: true,
          fxUsed: true,
          confidence: true,
          createdAt: true,
        },
      }),
      this.urbanexPrisma.advisorOutcome.findMany({
        where: { createdAt: { gte: from } },
        orderBy: { createdAt: 'desc' },
        select: {
          logId: true,
          action: true,
          finalPriceSyp: true,
          createdAt: true,
        },
      }),
    ]);

    const outcomesByLog = new Map<string, typeof outcomes>();
    for (const outcome of outcomes) {
      const list = outcomesByLog.get(outcome.logId) ?? [];
      list.push(outcome);
      outcomesByLog.set(outcome.logId, list);
    }

    const rows: AdminAdvisorExportRow[] = [];
    for (const log of requestLogs) {
      const requestId = String(log.id);
      const joinedOutcomes = outcomesByLog.get(requestId) ?? [];

      if (!joinedOutcomes.length) {
        rows.push({
          request_id: requestId,
          endpoint: log.endpoint,
          city: log.cityNorm ?? null,
          district: log.districtNorm ?? null,
          property_type: log.propertyTypeNorm ?? null,
          area_m2: log.areaM2 ?? null,
          sample_count: log.sampleCount ?? null,
          fx_used: log.fxUsed ?? null,
          confidence: log.confidence ?? null,
          request_created_at: log.createdAt.toISOString(),
          outcome_action: null,
          final_price_syp: null,
          outcome_created_at: null,
        });
        continue;
      }

      for (const outcome of joinedOutcomes) {
        rows.push({
          request_id: requestId,
          endpoint: log.endpoint,
          city: log.cityNorm ?? null,
          district: log.districtNorm ?? null,
          property_type: log.propertyTypeNorm ?? null,
          area_m2: log.areaM2 ?? null,
          sample_count: log.sampleCount ?? null,
          fx_used: log.fxUsed ?? null,
          confidence: log.confidence ?? null,
          request_created_at: log.createdAt.toISOString(),
          outcome_action: outcome.action,
          final_price_syp: outcome.finalPriceSyp?.toString() ?? null,
          outcome_created_at: outcome.createdAt.toISOString(),
        });
      }
    }

    return rows;
  }

  toCsv(rows: AdminAdvisorExportRow[]): string {
    const headers = [
      'request_id',
      'endpoint',
      'city',
      'district',
      'property_type',
      'area_m2',
      'sample_count',
      'fx_used',
      'confidence',
      'request_created_at',
      'outcome_action',
      'final_price_syp',
      'outcome_created_at',
    ];

    const escapeCsv = (value: unknown): string => {
      if (value == null) {
        return '';
      }
      const text = String(value);
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(
        headers
          .map((header) => {
            const key = header as keyof AdminAdvisorExportRow;
            return escapeCsv(row[key]);
          })
          .join(','),
      );
    }

    return `${lines.join('\n')}\n`;
  }
}
