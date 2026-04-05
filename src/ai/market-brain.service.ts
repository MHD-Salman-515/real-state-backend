import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildExplainTrace, ExplainTrace } from '../advisor/explanation/explain-trace.helper';

export interface MarketEstimateInput {
  area_m2: number;
  district: string;
  property_type?: string;
  condition?: string;
}

export interface MarketEstimateResult {
  district: string;
  avg_price_m2: number;
  area_m2: number;
  low_syp: number;
  mid_syp: number;
  high_syp: number;
  notes: string[];
  confidence: 'low' | 'medium' | 'high';
  explain_trace?: ExplainTrace;
}

@Injectable()
export class MarketBrainService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeDistrict(input: string): string {
    const value = String(input || '').trim().toLowerCase();
    if (!value) return '';

    const map: Record<string, string> = {
      'المزة': 'mazzeh',
      'مزة': 'mazzeh',
      'المزه': 'mazzeh',
      'كفرسوسة': 'kafr_souseh',
      'أبو رمانة': 'abu_rummaneh',
    };

    return map[value] ?? value;
  }

  async getMarketAvgPriceM2(
    district: string,
  ): Promise<{ district: string; avg_price_m2: number; last_update: Date } | null> {
    const rawDistrict = String(district || '').trim();
    if (!rawDistrict) return null;

    const normalized = this.normalizeDistrict(rawDistrict);

    const rows = await this.prisma.marketData.findMany({
      where: {
        district: {
          in: Array.from(new Set([normalized, rawDistrict])),
        },
        is_outlier: false,
      },
      select: {
        price_per_m2_syp: true,
        price_per_m2: true,
        created_at: true,
        district: true,
      },
      orderBy: {
        created_at: 'desc',
      },
      take: 500,
    });

    if (rows.length === 0) {
      return null;
    }

    const values = rows
      .map((row) => {
        const syp = Number(row.price_per_m2_syp);
        if (Number.isFinite(syp) && syp > 0) return syp;
        const fallback = Number(row.price_per_m2);
        if (Number.isFinite(fallback) && fallback > 0) return fallback;
        return null;
      })
      .filter((value): value is number => value != null);

    if (values.length === 0) return null;

    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;

    return {
      district: this.normalizeDistrict(String(rows[0].district || normalized)),
      avg_price_m2: Number(avg.toFixed(2)),
      last_update: rows[0].created_at,
    };
  }

  async estimatePriceRangeSyp(params: MarketEstimateInput): Promise<MarketEstimateResult | null> {
    const area = Number(params.area_m2);
    if (!Number.isFinite(area) || area <= 0) return null;

    const market = await this.getMarketAvgPriceM2(params.district);
    if (!market) return null;

    let mid = area * market.avg_price_m2;
    let rangePct = 0.06;
    const notes: string[] = [];

    if (area >= 180) {
      rangePct += 0.02;
      notes.push('المساحة الكبيرة تزيد هامش التفاوت السعري.');
    }

    const condition = String(params.condition || '').toLowerCase();
    if (condition.includes('جديدة') || condition.includes('حديثة')) {
      mid *= 1.05;
      notes.push('تم رفع السعر الوسطي بسبب حالة تشطيب حديثة.');
    }
    if (condition.includes('قديمة') || condition.includes('بحاجة ترميم')) {
      mid *= 0.9;
      notes.push('تم تخفيض السعر الوسطي بسبب الحاجة للترميم.');
    }

    const low = mid * (1 - rangePct);
    const high = mid * (1 + rangePct);

    const roundedMid = this.roundToMillion(mid);
    const roundedLow = this.roundToMillion(low);
    const roundedHigh = this.roundToMillion(high);

    let confidence: 'low' | 'medium' | 'high' = 'high';
    if (!params.property_type || !params.condition) {
      confidence = 'medium';
    }
    if (!market || !area) {
      confidence = 'low';
    }

    return {
      district: market.district,
      avg_price_m2: this.roundToMillion(market.avg_price_m2),
      area_m2: area,
      low_syp: roundedLow,
      mid_syp: roundedMid,
      high_syp: roundedHigh,
      notes,
      confidence,
      explain_trace: buildExplainTrace({
        inputs_used: {
          district: market.district,
          area_m2: area,
          ...(params.property_type ? { property_type: params.property_type } : {}),
          ...(params.condition ? { condition: params.condition } : {}),
        },
        data_sources: {
          market_data: {
            sample_scope: `district=${market.district}`,
            updated_at: market.last_update.toISOString(),
          },
        },
        computation_steps: [
          {
            step: 'mid_syp = area_m2 * avg_price_m2',
            value: { area_m2: area, avg_price_m2: market.avg_price_m2, mid_syp: this.roundToMillion(mid) },
          },
          {
            step: 'adjust range pct and condition multiplier',
            value: { range_pct: rangePct, condition: params.condition ?? null },
          },
          {
            step: 'low/high around mid with range_pct',
            value: { low_syp: roundedLow, mid_syp: roundedMid, high_syp: roundedHigh },
          },
        ],
      }),
    };
  }

  private roundToMillion(value: number): number {
    return Math.max(0, Math.round(value / 1_000_000) * 1_000_000);
  }
}
