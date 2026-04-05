import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UrbanexPrismaService } from '../prisma/urbanex-prisma.service';

interface MarketRow {
  city: string | null;
  district: string | null;
  property_type: string | null;
  price_per_m2_syp: number | null;
  created_at: Date;
}

@Injectable()
export class MarketSnapshotService {
  constructor(private readonly urbanexPrisma: UrbanexPrismaService) {}

  async rebuildSnapshots(days = 365): Promise<{
    days: number;
    source_rows: number;
    grouped_snapshots: number;
    upserted_rows: number;
    skipped_rows: number;
  }> {
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new BadRequestException('days must be an integer between 1 and 3650');
    }

    const from = new Date();
    from.setDate(from.getDate() - days);

    const rows = await this.urbanexPrisma.$queryRaw<MarketRow[]>(Prisma.sql`
      SELECT city, district, property_type, price_per_m2_syp, created_at
      FROM market_data
      WHERE created_at >= ${from}
        AND (is_outlier = 0 OR is_outlier IS NULL)
        AND price_per_m2_syp IS NOT NULL
    `);

    const grouped = new Map<
      string,
      {
        city: string;
        district: string;
        property_type: string;
        snapshot_date: string;
        values: number[];
      }
    >();

    let skipped = 0;
    for (const row of rows) {
      const city = String(row.city || '').trim();
      const district = String(row.district || '').trim();
      const propertyType = String(row.property_type || '').trim();
      const value = Number(row.price_per_m2_syp);
      const createdAt = new Date(row.created_at);

      if (!city || !district || !propertyType) {
        skipped += 1;
        continue;
      }
      if (!Number.isFinite(value) || value <= 0) {
        skipped += 1;
        continue;
      }
      if (Number.isNaN(createdAt.getTime())) {
        skipped += 1;
        continue;
      }

      const snapshotDate = createdAt.toISOString().slice(0, 10);
      const key = `${city}|${district}|${propertyType}|${snapshotDate}`;
      const bucket = grouped.get(key) ?? {
        city,
        district,
        property_type: propertyType,
        snapshot_date: snapshotDate,
        values: [],
      };
      bucket.values.push(value);
      grouped.set(key, bucket);
    }

    let upserted = 0;
    for (const bucket of grouped.values()) {
      if (!bucket.values.length) {
        skipped += 1;
        continue;
      }

      const avg = this.mean(bucket.values);
      const median = this.median(bucket.values);
      const min = Math.min(...bucket.values);
      const max = Math.max(...bucket.values);
      const sampleCount = bucket.values.length;
      const stddev = this.stddevPopulation(bucket.values, avg);
      const volatility = avg > 0 ? stddev / avg : 0;

      await this.urbanexPrisma.$executeRaw(Prisma.sql`
        INSERT INTO market_snapshot_daily
        (
          city,
          district,
          property_type,
          snapshot_date,
          avg_price_per_m2_syp,
          median_price_per_m2_syp,
          min_price_per_m2_syp,
          max_price_per_m2_syp,
          sample_count,
          volatility,
          trend_direction,
          created_at
        )
        VALUES
        (
          ${bucket.city},
          ${bucket.district},
          ${bucket.property_type},
          ${bucket.snapshot_date},
          ${avg},
          ${median},
          ${min},
          ${max},
          ${sampleCount},
          ${volatility},
          NULL,
          NOW(3)
        )
        ON DUPLICATE KEY UPDATE
          avg_price_per_m2_syp = VALUES(avg_price_per_m2_syp),
          median_price_per_m2_syp = VALUES(median_price_per_m2_syp),
          min_price_per_m2_syp = VALUES(min_price_per_m2_syp),
          max_price_per_m2_syp = VALUES(max_price_per_m2_syp),
          sample_count = VALUES(sample_count),
          volatility = VALUES(volatility)
      `);

      upserted += 1;
    }

    return {
      days,
      source_rows: rows.length,
      grouped_snapshots: grouped.size,
      upserted_rows: upserted,
      skipped_rows: skipped,
    };
  }

  private mean(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private stddevPopulation(values: number[], mean: number): number {
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return Math.sqrt(Math.max(0, variance));
  }
}
