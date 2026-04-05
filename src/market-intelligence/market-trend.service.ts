import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeAreaValue } from '../advisor/utils/area-normalization';
import { UrbanexPrismaService } from '../prisma/urbanex-prisma.service';

interface SnapshotRow {
  avg_price_per_m2_syp: number;
  snapshot_date: Date;
}

@Injectable()
export class MarketTrendService {
  constructor(private readonly urbanexPrisma: UrbanexPrismaService) {}

  async getTrend(params: {
    city: string;
    district: string;
    property_type: string;
    days?: number;
  }): Promise<{
    trend_direction: 'UP' | 'DOWN' | 'STABLE';
    change_pct: number;
    volatility: number;
    sparkline: number[];
  }> {
    const city = normalizeAreaValue('city', params.city);
    const district = normalizeAreaValue('district', params.district);
    const propertyType = normalizeAreaValue('property_type', params.property_type);
    const days = params.days == null ? 30 : Number(params.days);

    if (!city || !district || !propertyType) {
      throw new BadRequestException('city, district and property_type are required');
    }
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new BadRequestException('days must be an integer between 1 and 3650');
    }

    const from = new Date();
    from.setDate(from.getDate() - days);

    const rows = await this.urbanexPrisma.$queryRaw<SnapshotRow[]>(Prisma.sql`
      SELECT avg_price_per_m2_syp, snapshot_date
      FROM market_snapshot_daily
      WHERE city = ${city}
        AND district = ${district}
        AND property_type = ${propertyType}
        AND snapshot_date >= ${from}
      ORDER BY snapshot_date ASC
    `);

    if (!rows.length) {
      return {
        trend_direction: 'STABLE',
        change_pct: 0,
        volatility: 0,
        sparkline: [],
      };
    }

    const sparkline = rows
      .map((row) => Number(row.avg_price_per_m2_syp))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (!sparkline.length) {
      return {
        trend_direction: 'STABLE',
        change_pct: 0,
        volatility: 0,
        sparkline: [],
      };
    }

    const first = sparkline[0];
    const last = sparkline[sparkline.length - 1];
    const changePct = first > 0 ? ((last - first) / first) * 100 : 0;

    const mean = sparkline.reduce((sum, value) => sum + value, 0) / sparkline.length;
    const variance = sparkline.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sparkline.length;
    const stddev = Math.sqrt(Math.max(0, variance));
    const volatility = mean > 0 ? stddev / mean : 0;

    let trendDirection: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
    if (changePct > 3) {
      trendDirection = 'UP';
    } else if (changePct < -3) {
      trendDirection = 'DOWN';
    }

    return {
      trend_direction: trendDirection,
      change_pct: Number(changePct.toFixed(4)),
      volatility: Number(volatility.toFixed(6)),
      sparkline: sparkline.map((value) => Number(value.toFixed(2))),
    };
  }
}
