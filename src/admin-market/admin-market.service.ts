import { createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UrbanexPrismaService } from '../prisma/urbanex-prisma.service';
import {
  normalizeAreaInput,
  normalizeAreaValue,
} from '../advisor/utils/area-normalization';
import { ConfidenceService } from '../advisor/confidence/confidence.service';

interface MarketOutlierRow {
  id: number;
  city: string | null;
  district: string | null;
  property_type: string | null;
  area_m2: number | null;
  price_syp: number | null;
  ppm2_syp: number | null;
  is_outlier?: boolean | number | null;
  created_at: Date;
}

interface MarketBreakdownRow {
  key_name: string | null;
  count_rows: bigint | number;
}

interface RebuildSummary {
  days: number;
  source_rows: number;
  aggregated_area_keys: number;
  upserted_rows: number;
  skipped_rows: number;
}

interface ParsedImportRow {
  city: string;
  district: string;
  property_type: string;
  area_m2: string;
  price_syp: string;
  price_usd: string;
  created_at: string;
  source: string;
}

interface PreparedImportRow {
  city: string;
  district: string;
  property_type: string;
  area_m2: number;
  price_syp: number;
  price_usd: number;
  price_per_m2: number;
  price_per_m2_syp: number;
  source: string;
  created_at: Date;
  fx_usd_to_syp: number;
  fx_source: string | null;
  ingest_hash: string;
}

interface ImportSummary {
  inserted: number;
  skipped_duplicates: number;
  invalid: number;
  total_rows: number;
}

export interface AdminMarketQaResponse {
  counts: {
    total_market_data: number;
    invalid_area: number;
    invalid_price: number;
    null_city_district_type: number;
  };
  outliers: {
    highest_ppm2_syp: Array<{
      id: number;
      city: string | null;
      district: string | null;
      property_type: string | null;
      area_m2: number | null;
      price_syp: number | null;
      ppm2_syp: number | null;
      created_at: string;
    }>;
    lowest_ppm2_syp: Array<{
      id: number;
      city: string | null;
      district: string | null;
      property_type: string | null;
      area_m2: number | null;
      price_syp: number | null;
      ppm2_syp: number | null;
      created_at: string;
    }>;
  };
  breakdown: {
    by_city: Array<{ city: string; count: number }>;
    by_property_type: Array<{ property_type: string; count: number }>;
  };
}

export interface AdminAreasQuery {
  city?: string;
  property_type?: string;
  district?: string;
  limit?: number;
}

export interface AdminAreasResponse {
  city: string;
  district: string;
  property_type: string;
  avg_price_per_m2_usd: number | null;
  fx_used: number | null;
  sample_count: number;
  updated_at: string;
  confidence_meta: {
    sample_score: number;
    recency_score: number;
    stability_score: number;
  };
}

export interface AdminMarketOutlierRow {
  id: number;
  city: string | null;
  district: string | null;
  property_type: string | null;
  area_m2: number | null;
  price_syp: number | null;
  ppm2_syp: number;
  is_outlier: boolean;
  reason: string;
  created_at: string;
}

interface AdminOutliersQuery {
  city?: string;
  district?: string;
  property_type?: string;
  limit?: number;
}

@Injectable()
export class AdminMarketService {
  constructor(
    private readonly urbanexPrisma: UrbanexPrismaService,
    private readonly confidenceService: ConfidenceService,
  ) {}

  async getQa(includeOutliers = false): Promise<AdminMarketQaResponse> {
    const outlierFilter = includeOutliers
      ? Prisma.sql`1 = 1`
      : Prisma.sql`(is_outlier = 0 OR is_outlier IS NULL)`;
    const [
      totalMarketData,
      invalidArea,
      invalidPrice,
      nullCityDistrictType,
      highestOutliers,
      lowestOutliers,
      byCity,
      byPropertyType,
    ] = await Promise.all([
      this.urbanexPrisma.marketData.count(),
      this.urbanexPrisma.marketData.count({
        where: {
          OR: [{ area_m2: null }, { area_m2: { lte: 0 } }],
        },
      }),
      this.urbanexPrisma.marketData.count({
        where: {
          AND: [
            {
              OR: [{ price_syp: null }, { price_syp: { lte: 0 } }],
            },
            {
              OR: [{ price_usd: null }, { price_usd: { lte: 0 } }],
            },
          ],
        },
      }),
      this.urbanexPrisma.$queryRaw<{ count_rows: bigint | number }[]>(Prisma.sql`
        SELECT COUNT(*) AS count_rows
        FROM market_data
        WHERE city IS NULL
          OR district IS NULL
          OR property_type IS NULL
          OR TRIM(city) = ''
          OR TRIM(district) = ''
          OR TRIM(property_type) = ''
      `),
      this.urbanexPrisma.$queryRaw<MarketOutlierRow[]>(Prisma.sql`
        SELECT
          id,
          city,
          district,
          property_type,
          area_m2,
          price_syp,
          COALESCE(
            price_per_m2_syp,
            CASE WHEN area_m2 > 0 AND price_syp > 0 THEN price_syp / area_m2 END,
            CASE WHEN area_m2 > 0 AND price_usd > 0 AND fx_usd_to_syp > 0 THEN (price_usd * fx_usd_to_syp) / area_m2 END
          ) AS ppm2_syp,
          created_at
        FROM market_data
        WHERE area_m2 > 0
          AND ${outlierFilter}
          AND (
            (price_per_m2_syp IS NOT NULL AND price_per_m2_syp > 0)
            OR (price_syp IS NOT NULL AND price_syp > 0)
            OR (price_usd IS NOT NULL AND price_usd > 0 AND fx_usd_to_syp IS NOT NULL AND fx_usd_to_syp > 0)
          )
        ORDER BY ppm2_syp DESC
        LIMIT 20
      `),
      this.urbanexPrisma.$queryRaw<MarketOutlierRow[]>(Prisma.sql`
        SELECT
          id,
          city,
          district,
          property_type,
          area_m2,
          price_syp,
          COALESCE(
            price_per_m2_syp,
            CASE WHEN area_m2 > 0 AND price_syp > 0 THEN price_syp / area_m2 END,
            CASE WHEN area_m2 > 0 AND price_usd > 0 AND fx_usd_to_syp > 0 THEN (price_usd * fx_usd_to_syp) / area_m2 END
          ) AS ppm2_syp,
          created_at
        FROM market_data
        WHERE area_m2 > 0
          AND ${outlierFilter}
          AND (
            (price_per_m2_syp IS NOT NULL AND price_per_m2_syp > 0)
            OR (price_syp IS NOT NULL AND price_syp > 0)
            OR (price_usd IS NOT NULL AND price_usd > 0 AND fx_usd_to_syp IS NOT NULL AND fx_usd_to_syp > 0)
          )
        ORDER BY ppm2_syp ASC
        LIMIT 20
      `),
      this.urbanexPrisma.$queryRaw<MarketBreakdownRow[]>(Prisma.sql`
        SELECT city AS key_name, COUNT(*) AS count_rows
        FROM market_data
        GROUP BY city
        ORDER BY count_rows DESC
      `),
      this.urbanexPrisma.$queryRaw<MarketBreakdownRow[]>(Prisma.sql`
        SELECT property_type AS key_name, COUNT(*) AS count_rows
        FROM market_data
        GROUP BY property_type
        ORDER BY count_rows DESC
      `),
    ]);

    const toOutlier = (row: MarketOutlierRow) => ({
      id: row.id,
      city: row.city,
      district: row.district,
      property_type: row.property_type,
      area_m2: row.area_m2,
      price_syp: row.price_syp,
      ppm2_syp:
        row.ppm2_syp == null || !Number.isFinite(Number(row.ppm2_syp))
          ? null
          : Number(row.ppm2_syp),
      created_at: new Date(row.created_at).toISOString(),
    });

    const toBreakdownCount = (value: bigint | number): number => Number(value);

    return {
      counts: {
        total_market_data: totalMarketData,
        invalid_area: invalidArea,
        invalid_price: invalidPrice,
        null_city_district_type: toBreakdownCount(
          nullCityDistrictType[0]?.count_rows ?? 0,
        ),
      },
      outliers: {
        highest_ppm2_syp: highestOutliers.map(toOutlier),
        lowest_ppm2_syp: lowestOutliers.map(toOutlier),
      },
      breakdown: {
        by_city: byCity.map((row) => ({
          city: row.key_name ?? 'unknown',
          count: toBreakdownCount(row.count_rows),
        })),
        by_property_type: byPropertyType.map((row) => ({
          property_type: row.key_name ?? 'unknown',
          count: toBreakdownCount(row.count_rows),
        })),
      },
    };
  }

  async getAreas(query: AdminAreasQuery): Promise<AdminAreasResponse[]> {
    const city = normalizeAreaValue('city', query.city ?? 'damascus');
    const district = normalizeAreaValue('district', query.district);
    const propertyType = normalizeAreaValue('property_type', query.property_type);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));

    const rows = await this.urbanexPrisma.areasPrice.findMany({
      where: {
        ...(city ? { city } : {}),
        ...(district ? { district } : {}),
        ...(propertyType ? { property_type: propertyType } : {}),
      },
      orderBy: [{ sample_count: 'desc' }, { updated_at: 'desc' }],
      take: limit,
    });

    const withConfidence = await Promise.all(
      rows.map(async (row) => {
        const stabilityCv = await this.findAreaStabilityCv({
          city: row.city,
          district: row.district,
          property_type: row.property_type,
        });

        return {
          city: row.city,
          district: row.district,
          property_type: row.property_type,
          avg_price_per_m2_usd: row.avg_price_per_m2,
          fx_used: row.fx_usd_to_syp,
          sample_count: row.sample_count ?? 0,
          updated_at: row.updated_at.toISOString(),
          confidence_meta: {
            sample_score: this.confidenceService.computeSampleScore(
              row.sample_count ?? 0,
            ),
            recency_score: this.confidenceService.computeRecencyScore(row.updated_at),
            stability_score: this.confidenceService.computeStabilityScore(stabilityCv),
          },
        };
      }),
    );

    return withConfidence;
  }

  async rebuildAreas(days: number): Promise<RebuildSummary> {
    const from = new Date();
    from.setDate(from.getDate() - days);

    const [latestFx, marketRows] = await Promise.all([
      this.urbanexPrisma.fxRate.findFirst({
        where: { effective_at: { lte: new Date() } },
        orderBy: { effective_at: 'desc' },
      }),
      this.urbanexPrisma.marketData.findMany({
        where: { created_at: { gte: from }, is_outlier: false },
        select: {
          city: true,
          district: true,
          property_type: true,
          area_m2: true,
          price_usd: true,
          price_syp: true,
          price_per_m2: true,
          price_per_m2_syp: true,
        },
      }),
    ]);

    const fx = Number(latestFx?.usd_to_syp ?? 0);
    if (!Number.isFinite(fx) || fx <= 0) {
      throw new Error('No valid fx_rates row found for rebuild');
    }

    const aggregates = new Map<
      string,
      { sumUsdPerM2: number; sumSypPerM2: number; count: number }
    >();
    let skipped = 0;

    for (const row of marketRows) {
      const normalized = normalizeAreaInput({
        city: row.city,
        district: row.district,
        property_type: row.property_type,
      });
      if (!normalized.city_norm || !normalized.district_norm || !normalized.property_type_norm) {
        skipped += 1;
        continue;
      }

      const areaM2 = Number(row.area_m2);
      if (!Number.isFinite(areaM2) || areaM2 <= 0) {
        skipped += 1;
        continue;
      }

      const usdPerM2Direct = Number(row.price_per_m2);
      const sypPerM2Direct = Number(row.price_per_m2_syp);
      const usdPerM2FromUsd =
        Number.isFinite(Number(row.price_usd)) && Number(row.price_usd) > 0
          ? Number(row.price_usd) / areaM2
          : null;
      const sypPerM2FromSyp =
        Number.isFinite(Number(row.price_syp)) && Number(row.price_syp) > 0
          ? Number(row.price_syp) / areaM2
          : null;

      const usdPerM2 =
        Number.isFinite(usdPerM2Direct) && usdPerM2Direct > 0
          ? usdPerM2Direct
          : usdPerM2FromUsd ?? (sypPerM2FromSyp != null ? sypPerM2FromSyp / fx : null);
      const sypPerM2 =
        Number.isFinite(sypPerM2Direct) && sypPerM2Direct > 0
          ? sypPerM2Direct
          : sypPerM2FromSyp ?? (usdPerM2 != null ? usdPerM2 * fx : null);

      if (usdPerM2 == null || sypPerM2 == null) {
        skipped += 1;
        continue;
      }

      const areaKey = `${normalized.city_norm}|${normalized.district_norm}|${normalized.property_type_norm}`;
      const stats = aggregates.get(areaKey) ?? {
        sumUsdPerM2: 0,
        sumSypPerM2: 0,
        count: 0,
      };
      stats.sumUsdPerM2 += usdPerM2;
      stats.sumSypPerM2 += sypPerM2;
      stats.count += 1;
      aggregates.set(areaKey, stats);
    }

    let upserted = 0;
    const txOps: Array<Prisma.PrismaPromise<unknown>> = [];
    const now = new Date();
    for (const [areaKey, stats] of aggregates.entries()) {
      const [city, district, propertyType] = areaKey.split('|');
      txOps.push(
        this.urbanexPrisma.areasPrice.upsert({
          where: {
            city_district_property_type: {
              city,
              district,
              property_type: propertyType,
            },
          },
          create: {
            city,
            district,
            property_type: propertyType,
            avg_price_per_m2: stats.sumUsdPerM2 / stats.count,
            avg_price_per_m2_syp: stats.sumSypPerM2 / stats.count,
            sample_count: stats.count,
            fx_usd_to_syp: fx,
            fx_source: latestFx?.source ?? 'fx_rates',
            updated_at: now,
          },
          update: {
            avg_price_per_m2: stats.sumUsdPerM2 / stats.count,
            avg_price_per_m2_syp: stats.sumSypPerM2 / stats.count,
            sample_count: stats.count,
            fx_usd_to_syp: fx,
            fx_source: latestFx?.source ?? 'fx_rates',
            updated_at: now,
          },
        }),
      );
      upserted += 1;
    }

    for (let i = 0; i < txOps.length; i += 200) {
      await this.urbanexPrisma.$transaction(txOps.slice(i, i + 200));
    }

    return {
      days,
      source_rows: marketRows.length,
      aggregated_area_keys: aggregates.size,
      upserted_rows: upserted,
      skipped_rows: skipped,
    };
  }

  async importCsvAndRebuild(params: {
    fileBuffer: Buffer;
    days: number;
    source?: string;
  }): Promise<{
    import: ImportSummary;
    rebuild: RebuildSummary;
  }> {
    const csvContent = params.fileBuffer.toString('utf-8');
    const parsedRows = this.parseCsv(csvContent);

    const latestFx = await this.urbanexPrisma.fxRate.findFirst({
      where: { effective_at: { lte: new Date() } },
      orderBy: { effective_at: 'desc' },
    });

    const fx = Number(latestFx?.usd_to_syp ?? 0);
    if (!Number.isFinite(fx) || fx <= 0) {
      throw new BadRequestException('No valid fx_rates row found for import');
    }

    const defaultSource = this.resolveSourceOverride(params.source);
    const preparedRows: PreparedImportRow[] = [];
    let invalid = 0;

    for (const row of parsedRows) {
      const normalized = normalizeAreaInput({
        city: row.city,
        district: row.district,
        property_type: row.property_type,
      });

      if (
        !normalized.city_norm ||
        !normalized.district_norm ||
        !normalized.property_type_norm
      ) {
        invalid += 1;
        continue;
      }

      const area = this.parsePositive(row.area_m2);
      if (area == null || area < 1) {
        invalid += 1;
        continue;
      }

      const priceSypRaw = this.parsePositive(row.price_syp);
      const priceUsdRaw = this.parsePositive(row.price_usd);
      if (priceSypRaw == null && priceUsdRaw == null) {
        invalid += 1;
        continue;
      }

      const priceSyp = priceSypRaw ?? (priceUsdRaw as number) * fx;
      const priceUsd = priceUsdRaw ?? (priceSypRaw as number) / fx;
      if (!Number.isFinite(priceSyp) || priceSyp <= 0) {
        invalid += 1;
        continue;
      }
      if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
        invalid += 1;
        continue;
      }

      const createdAt = this.parseCreatedAt(row.created_at);
      const ingestHash = this.buildIngestHash({
        city: normalized.city_norm,
        district: normalized.district_norm,
        property_type: normalized.property_type_norm,
        area_m2: area,
        price_syp: priceSyp,
        created_at: createdAt,
      });
      const sourceValue = defaultSource ?? (row.source.trim() || 'import_ui');

      preparedRows.push({
        city: normalized.city_norm,
        district: normalized.district_norm,
        property_type: normalized.property_type_norm,
        area_m2: area,
        price_syp: priceSyp,
        price_usd: priceUsd,
        price_per_m2: priceUsd / area,
        price_per_m2_syp: priceSyp / area,
        source: sourceValue,
        created_at: createdAt,
        fx_usd_to_syp: fx,
        fx_source: latestFx?.source ?? 'fx_rates',
        ingest_hash: ingestHash,
      });
    }

    const uniqueRows = new Map<string, PreparedImportRow>();
    for (const row of preparedRows) {
      if (!uniqueRows.has(row.ingest_hash)) {
        uniqueRows.set(row.ingest_hash, row);
      }
    }
    const dedupedRows = Array.from(uniqueRows.values());
    const totalRows = parsedRows.length;

    const insertedCount = dedupedRows.length
      ? (
          await this.urbanexPrisma.marketData.createMany({
            data: dedupedRows.map((row) => ({
              city: row.city,
              district: row.district,
              property_type: row.property_type,
              area_m2: row.area_m2,
              price_syp: row.price_syp,
              price_usd: row.price_usd,
              price_per_m2: row.price_per_m2,
              price_per_m2_syp: row.price_per_m2_syp,
              source: row.source,
              created_at: row.created_at,
              fx_usd_to_syp: row.fx_usd_to_syp,
              fx_source: row.fx_source,
              ingest_hash: row.ingest_hash,
              raw_json: Prisma.DbNull,
            })),
            skipDuplicates: true,
          })
        ).count
      : 0;

    const skippedDuplicates = totalRows - insertedCount - invalid;
    const rebuildSummary = await this.rebuildAreas(params.days);

    return {
      import: {
        inserted: insertedCount,
        skipped_duplicates: Math.max(0, skippedDuplicates),
        invalid,
        total_rows: totalRows,
      },
      rebuild: rebuildSummary,
    };
  }

  async getOutliers(query: AdminOutliersQuery): Promise<AdminMarketOutlierRow[]> {
    const city = normalizeAreaValue('city', query.city);
    const district = normalizeAreaValue('district', query.district);
    const propertyType = normalizeAreaValue('property_type', query.property_type);
    const limit = Math.min(300, Math.max(1, query.limit ?? 100));

    const rows = await this.urbanexPrisma.marketData.findMany({
      where: {
        ...(city ? { city } : {}),
        ...(district ? { district } : {}),
        ...(propertyType ? { property_type: propertyType } : {}),
        area_m2: { gt: 0 },
        OR: [
          { price_per_m2_syp: { gt: 0 } },
          { price_syp: { gt: 0 } },
          {
            AND: [
              { price_usd: { gt: 0 } },
              { fx_usd_to_syp: { gt: 0 } },
            ],
          },
        ],
      },
      select: {
        id: true,
        city: true,
        district: true,
        property_type: true,
        area_m2: true,
        price_syp: true,
        price_usd: true,
        price_per_m2_syp: true,
        fx_usd_to_syp: true,
        is_outlier: true,
        created_at: true,
      },
      take: limit,
      orderBy: { created_at: 'desc' },
    });

    const withPpm2 = rows
      .map((row) => {
        const ppm2 = this.computePpm2Syp({
          area_m2: row.area_m2,
          price_syp: row.price_syp,
          price_usd: row.price_usd,
          price_per_m2_syp: row.price_per_m2_syp,
          fx_usd_to_syp: row.fx_usd_to_syp,
        });
        if (ppm2 == null) {
          return null;
        }
        const key = `${row.city ?? ''}|${row.district ?? ''}|${row.property_type ?? ''}`;
        return { row, ppm2, key };
      })
      .filter((item): item is NonNullable<typeof item> => item != null);

    const mediansByArea = new Map<string, number>();
    for (const item of withPpm2) {
      const bucket = mediansByArea.get(item.key);
      if (bucket == null) {
        mediansByArea.set(item.key, item.ppm2);
      }
    }

    const areaSeries = new Map<string, number[]>();
    for (const item of withPpm2) {
      const list = areaSeries.get(item.key) ?? [];
      list.push(item.ppm2);
      areaSeries.set(item.key, list);
    }
    for (const [key, list] of areaSeries.entries()) {
      mediansByArea.set(key, this.computeMedian(list));
    }

    const scored = withPpm2.map(({ row, ppm2, key }) => {
      const median = mediansByArea.get(key) ?? ppm2;
      const ratio = median > 0 ? ppm2 / median : 1;
      const reason = this.computeOutlierReason({
        ratio,
        area_m2: Number(row.area_m2 ?? 0),
      });
      const score = Math.abs(Math.log(Math.max(0.0001, ratio)));
      return {
        id: row.id,
        city: row.city,
        district: row.district,
        property_type: row.property_type,
        area_m2: row.area_m2,
        price_syp: row.price_syp,
        ppm2_syp: ppm2,
        is_outlier: Boolean(row.is_outlier),
        reason,
        created_at: row.created_at.toISOString(),
        _score: score,
      };
    });

    scored.sort((a, b) => b._score - a._score);
    return scored.map(({ _score, ...row }) => row);
  }

  async markOutliers(params: {
    ids: number[];
    is_outlier: boolean;
    rebuild_days?: number;
  }): Promise<{
    updated_rows: number;
    rebuild: RebuildSummary | null;
  }> {
    const result = await this.urbanexPrisma.marketData.updateMany({
      where: { id: { in: params.ids } },
      data: { is_outlier: params.is_outlier },
    });

    let rebuild: RebuildSummary | null = null;
    if (params.rebuild_days != null) {
      rebuild = await this.rebuildAreas(params.rebuild_days);
    }

    return {
      updated_rows: result.count,
      rebuild,
    };
  }

  private parseCsv(content: string): ParsedImportRow[] {
    const lines = content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      return [];
    }

    const headers = this.parseCsvLine(lines[0]).map((value) =>
      this.normalizeHeader(value),
    );
    const rows: ParsedImportRow[] = [];

    for (let i = 1; i < lines.length; i += 1) {
      const values = this.parseCsvLine(lines[i]);
      const raw = Object.fromEntries(
        headers.map((header, idx) => [header, (values[idx] ?? '').trim()]),
      );

      rows.push({
        city: this.pickValue(raw, ['city']),
        district: this.pickValue(raw, ['district']),
        property_type: this.pickValue(raw, [
          'property_type',
          'propertytype',
          'type',
        ]),
        area_m2: this.pickValue(raw, ['area_m2', 'area', 'sqm']),
        price_syp: this.pickValue(raw, ['price_syp', 'syp', 'price']),
        price_usd: this.pickValue(raw, ['price_usd', 'usd']),
        created_at: this.pickValue(raw, ['created_at', 'createdat', 'date']),
        source: this.pickValue(raw, ['source']),
      });
    }

    return rows;
  }

  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];

      if (char === '"') {
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }

      if (char === ',' && !inQuotes) {
        fields.push(current);
        current = '';
        continue;
      }

      current += char;
    }

    fields.push(current);
    return fields;
  }

  private normalizeHeader(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '_');
  }

  private pickValue(row: Record<string, string>, aliases: string[]): string {
    for (const alias of aliases) {
      const value = row[alias];
      if (value != null) {
        return value;
      }
    }
    return '';
  }

  private parsePositive(value: string): number | null {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      return null;
    }
    return num;
  }

  private parseCreatedAt(value: string): Date {
    if (!value || !value.trim()) {
      return new Date();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private resolveSourceOverride(value?: string): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private stableNumberString(value: number): string {
    if (Number.isInteger(value)) {
      return String(value);
    }
    return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }

  private buildIngestHash(params: {
    city: string;
    district: string;
    property_type: string;
    area_m2: number;
    price_syp: number;
    created_at: Date;
  }): string {
    const date = params.created_at.toISOString().slice(0, 10);
    const payload = [
      params.city,
      params.district,
      params.property_type,
      this.stableNumberString(params.area_m2),
      this.stableNumberString(params.price_syp),
      date,
    ].join('|');
    return createHash('sha1').update(payload).digest('hex');
  }

  private computePpm2Syp(input: {
    area_m2: number | null;
    price_syp: number | null;
    price_usd: number | null;
    price_per_m2_syp: number | null;
    fx_usd_to_syp: number | null;
  }): number | null {
    const area = Number(input.area_m2 ?? 0);
    if (!Number.isFinite(area) || area <= 0) {
      return null;
    }

    const direct = Number(input.price_per_m2_syp ?? 0);
    if (Number.isFinite(direct) && direct > 0) {
      return direct;
    }

    const syp = Number(input.price_syp ?? 0);
    if (Number.isFinite(syp) && syp > 0) {
      return syp / area;
    }

    const usd = Number(input.price_usd ?? 0);
    const fx = Number(input.fx_usd_to_syp ?? 0);
    if (Number.isFinite(usd) && usd > 0 && Number.isFinite(fx) && fx > 0) {
      return (usd * fx) / area;
    }

    return null;
  }

  private computeMedian(values: number[]): number {
    if (!values.length) {
      return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
      return sorted[mid];
    }
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private computeOutlierReason(params: { ratio: number; area_m2: number }): string {
    if (!Number.isFinite(params.area_m2) || params.area_m2 < 20) {
      return 'tiny_area';
    }
    if (params.area_m2 > 2000) {
      return 'huge_area';
    }
    if (params.ratio >= 1.8) {
      return 'high_vs_area_median';
    }
    if (params.ratio <= 0.55) {
      return 'low_vs_area_median';
    }
    return 'review';
  }

  private async findAreaStabilityCv(area: {
    city: string;
    district: string;
    property_type: string;
  }): Promise<number | null> {
    const rows = await this.urbanexPrisma.$queryRaw<
      Array<{
        sample_count: bigint | number;
        avg_ppm2: number | string | null;
        stddev_ppm2: number | string | null;
      }>
    >(Prisma.sql`
      SELECT
        COUNT(*) AS sample_count,
        AVG(
          COALESCE(
            price_per_m2_syp,
            CASE WHEN area_m2 > 0 AND price_syp > 0 THEN price_syp / area_m2 END,
            CASE WHEN area_m2 > 0 AND price_usd > 0 AND fx_usd_to_syp > 0 THEN (price_usd * fx_usd_to_syp) / area_m2 END
          )
        ) AS avg_ppm2,
        STDDEV_POP(
          COALESCE(
            price_per_m2_syp,
            CASE WHEN area_m2 > 0 AND price_syp > 0 THEN price_syp / area_m2 END,
            CASE WHEN area_m2 > 0 AND price_usd > 0 AND fx_usd_to_syp > 0 THEN (price_usd * fx_usd_to_syp) / area_m2 END
          )
        ) AS stddev_ppm2
      FROM market_data
      WHERE city = ${area.city}
        AND district = ${area.district}
        AND property_type = ${area.property_type}
        AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        AND area_m2 > 0
    `);

    if (!rows.length) {
      return null;
    }

    const sampleCount = Number(rows[0].sample_count ?? 0);
    const avg = Number(rows[0].avg_ppm2 ?? 0);
    const stddev = Number(rows[0].stddev_ppm2 ?? 0);

    if (!Number.isFinite(sampleCount) || sampleCount < 5) {
      return null;
    }
    if (!Number.isFinite(avg) || avg <= 0 || !Number.isFinite(stddev) || stddev < 0) {
      return null;
    }

    return stddev / avg;
  }
}
