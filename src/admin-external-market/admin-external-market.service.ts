import { createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeAreaInput, normalizeAreaValue } from '../advisor/utils/area-normalization';
import { UrbanexPrismaService } from '../prisma/urbanex-prisma.service';
import { CreateExternalMarketObservationDto } from './dto/create-external-market-observation.dto';
import { CreateExternalMarketSourceDto } from './dto/create-external-market-source.dto';

interface SourceRow {
  id: number;
  name: string;
  source_type: string | null;
  base_url: string | null;
  reliability_score: number;
  is_active: number;
  methodology_json: unknown;
  created_at: Date;
  updated_at: Date;
}

interface ObservationJoinRow {
  source_id: number;
  source_name: string;
  reliability_score: number;
  city: string;
  district: string;
  property_type: string;
  metric: string;
  value: number;
  published_at: Date;
}

@Injectable()
export class AdminExternalMarketService {
  constructor(private readonly urbanexPrisma: UrbanexPrismaService) {}

  async createSource(dto: CreateExternalMarketSourceDto) {
    const name = String(dto.name || '').trim();
    if (!name) {
      throw new BadRequestException('name is required');
    }

    const sourceType = this.cleanString(dto.source_type);
    const baseUrl = this.cleanString(dto.base_url);
    const reliability = this.normalizeReliability(dto.reliability_score);
    const methodologyJson = dto.methodology_json ?? null;

    await this.urbanexPrisma.$executeRaw(Prisma.sql`
      INSERT INTO external_market_sources
      (name, source_type, base_url, reliability_score, is_active, methodology_json, created_at, updated_at)
      VALUES
      (${name}, ${sourceType}, ${baseUrl}, ${reliability}, 1, ${methodologyJson}, NOW(3), NOW(3))
    `);

    const created = await this.urbanexPrisma.$queryRaw<SourceRow[]>(Prisma.sql`
      SELECT
        id,
        name,
        source_type,
        base_url,
        reliability_score,
        is_active,
        methodology_json,
        created_at,
        updated_at
      FROM external_market_sources
      ORDER BY id DESC
      LIMIT 1
    `);

    return this.serializeSource(created[0]);
  }

  async listSources() {
    const rows = await this.urbanexPrisma.$queryRaw<SourceRow[]>(Prisma.sql`
      SELECT
        id,
        name,
        source_type,
        base_url,
        reliability_score,
        is_active,
        methodology_json,
        created_at,
        updated_at
      FROM external_market_sources
      ORDER BY updated_at DESC, id DESC
    `);

    return {
      items: rows.map((row) => this.serializeSource(row)),
    };
  }

  async createObservation(dto: CreateExternalMarketObservationDto) {
    const prepared = await this.prepareObservation({
      sourceId: Number(dto.source_id),
      city: dto.city,
      district: dto.district,
      propertyType: dto.property_type,
      metric: dto.metric,
      value: Number(dto.value),
      valueUnit: dto.value_unit,
      url: dto.url,
      publishedAt: dto.published_at,
      rawJson: dto.raw_json,
    });

    const inserted = await this.insertObservation(prepared);
    return {
      status: inserted ? 'inserted' : 'skipped_duplicate',
      ingest_hash: prepared.ingest_hash,
      observation: {
        source_id: prepared.source_id,
        city: prepared.city,
        district: prepared.district,
        property_type: prepared.property_type,
        metric: prepared.metric,
        value: prepared.value,
        value_unit: prepared.value_unit,
        url: prepared.url,
        published_at: prepared.published_at.toISOString(),
      },
    };
  }

  async importCsv(params: {
    fileBuffer: Buffer;
    sourceId?: number;
    metric?: string;
    valueUnit?: string;
    monthsWindow?: number;
  }) {
    const csvContent = params.fileBuffer.toString('utf-8');
    const parsedRows = this.parseCsv(csvContent);

    const defaultMetric = this.normalizeMetric(params.metric ?? 'price_per_m2_syp');
    const defaultValueUnit = this.cleanString(params.valueUnit) ?? 'SYP_PER_M2';

    const preparedRows: Array<
      Awaited<ReturnType<AdminExternalMarketService['prepareObservation']>>
    > = [];

    let invalid = 0;
    for (const row of parsedRows) {
      const sourceIdRaw = row.source_id || String(params.sourceId ?? '');
      const sourceId = Number(sourceIdRaw);

      try {
        const prepared = await this.prepareObservation({
          sourceId,
          city: row.city,
          district: row.district,
          propertyType: row.property_type,
          metric: row.metric || defaultMetric,
          value: Number(row.value),
          valueUnit: row.value_unit || defaultValueUnit,
          url: row.url,
          publishedAt: row.published_at,
          rawJson: row,
        });
        preparedRows.push(prepared);
      } catch {
        invalid += 1;
      }
    }

    const unique = new Map<string, (typeof preparedRows)[number]>();
    for (const row of preparedRows) {
      if (!unique.has(row.ingest_hash)) {
        unique.set(row.ingest_hash, row);
      }
    }

    let inserted = 0;
    let skippedDuplicates = 0;
    for (const row of unique.values()) {
      const ok = await this.insertObservation(row);
      if (ok) {
        inserted += 1;
      } else {
        skippedDuplicates += 1;
      }
    }

    const rebuild = await this.rebuildBaseline({
      monthsWindow: this.resolveMonthsWindow(params.monthsWindow),
    });

    return {
      import: {
        inserted,
        skipped_duplicates: skippedDuplicates,
        invalid,
        total_rows: parsedRows.length,
      },
      rebuild,
    };
  }

  async rebuildBaseline(params?: { monthsWindow?: number }) {
    const monthsWindow = this.resolveMonthsWindow(params?.monthsWindow);
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setMonth(periodStart.getMonth() - monthsWindow);

    const observations = await this.urbanexPrisma.$queryRaw<ObservationJoinRow[]>(Prisma.sql`
      SELECT
        o.source_id,
        s.name AS source_name,
        s.reliability_score,
        o.city,
        o.district,
        o.property_type,
        o.metric,
        o.value,
        o.published_at
      FROM external_market_observations o
      INNER JOIN external_market_sources s ON s.id = o.source_id
      WHERE s.is_active = 1
        AND o.published_at >= ${periodStart}
        AND o.published_at <= ${periodEnd}
        AND o.value > 0
    `);

    type WeightedPoint = {
      source_id: number;
      source_name: string;
      value: number;
      weight: number;
      published_at: Date;
    };

    const groups = new Map<string, WeightedPoint[]>();
    const maxAgeDays = Math.max(1, monthsWindow * 30);

    for (const row of observations) {
      const city = normalizeAreaValue('city', row.city);
      const district = normalizeAreaValue('district', row.district);
      const propertyType = normalizeAreaValue('property_type', row.property_type);
      const metric = this.normalizeMetric(row.metric);
      const value = Number(row.value);
      if (!city || !district || !propertyType || !metric || !Number.isFinite(value) || value <= 0) {
        continue;
      }

      const reliability = this.normalizeReliability(row.reliability_score);
      const publishedAt = new Date(row.published_at);
      const ageDays = Math.max(0, (periodEnd.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24));
      const recencyFactor = Math.max(0.2, 1 - ageDays / maxAgeDays);
      const weight = Math.max(0.0001, reliability * recencyFactor);

      const key = `${city}|${district}|${propertyType}|${metric}`;
      const list = groups.get(key) ?? [];
      list.push({
        source_id: Number(row.source_id),
        source_name: String(row.source_name || ''),
        value,
        weight,
        published_at: publishedAt,
      });
      groups.set(key, list);
    }

    let upserted = 0;
    let skipped = 0;

    for (const [key, items] of groups.entries()) {
      if (!items.length) {
        skipped += 1;
        continue;
      }

      const [city, district, propertyType, metric] = key.split('|');
      const weightedMean = this.computeWeightedMean(items);
      const weightedMedian = this.computeWeightedMedian(items);
      const sampleCount = items.length;

      const sourceStats = new Map<number, { source_name: string; count: number; total_weight: number }>();
      for (const item of items) {
        const curr = sourceStats.get(item.source_id) ?? {
          source_name: item.source_name,
          count: 0,
          total_weight: 0,
        };
        curr.count += 1;
        curr.total_weight += item.weight;
        sourceStats.set(item.source_id, curr);
      }

      const sourcesJson = Array.from(sourceStats.entries())
        .map(([sourceId, data]) => ({
          source_id: sourceId,
          source_name: data.source_name,
          count: data.count,
          total_weight: Number(data.total_weight.toFixed(6)),
        }))
        .sort((a, b) => b.total_weight - a.total_weight);

      const methodologyJson = {
        method: 'weighted_mean_and_weighted_median',
        months_window: monthsWindow,
        weight_formula: 'weight = reliability_score * recency_factor',
        recency_factor: 'max(0.2, 1 - age_days / (months_window*30))',
        generated_at: new Date().toISOString(),
      };

      await this.urbanexPrisma.$executeRaw(Prisma.sql`
        INSERT INTO external_baseline_index
        (
          city,
          district,
          property_type,
          metric,
          period_start,
          period_end,
          value_mean,
          value_median,
          sample_count,
          methodology_json,
          sources_json,
          created_at,
          updated_at
        )
        VALUES
        (
          ${city},
          ${district},
          ${propertyType},
          ${metric},
          ${periodStart},
          ${periodEnd},
          ${weightedMean},
          ${weightedMedian},
          ${sampleCount},
          ${methodologyJson},
          ${sourcesJson},
          NOW(3),
          NOW(3)
        )
        ON DUPLICATE KEY UPDATE
          period_start = VALUES(period_start),
          period_end = VALUES(period_end),
          value_mean = VALUES(value_mean),
          value_median = VALUES(value_median),
          sample_count = VALUES(sample_count),
          methodology_json = VALUES(methodology_json),
          sources_json = VALUES(sources_json),
          updated_at = NOW(3)
      `);

      upserted += 1;
    }

    return {
      months_window: monthsWindow,
      source_rows: observations.length,
      aggregated_keys: groups.size,
      upserted_rows: upserted,
      skipped_rows: skipped,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    };
  }

  async getBaseline(params: {
    city?: string;
    district?: string;
    propertyType?: string;
  }) {
    const city = normalizeAreaValue('city', params.city);
    const district = normalizeAreaValue('district', params.district);
    const propertyType = normalizeAreaValue('property_type', params.propertyType);

    const conditions: Prisma.Sql[] = [];
    if (city) conditions.push(Prisma.sql`city = ${city}`);
    if (district) conditions.push(Prisma.sql`district = ${district}`);
    if (propertyType) conditions.push(Prisma.sql`property_type = ${propertyType}`);

    let whereClause = Prisma.empty;
    if (conditions.length > 0) {
      let predicate = conditions[0];
      for (let i = 1; i < conditions.length; i += 1) {
        predicate = Prisma.sql`${predicate} AND ${conditions[i]}`;
      }
      whereClause = Prisma.sql`WHERE ${predicate}`;
    }

    const rows = await this.urbanexPrisma.$queryRaw<Array<{
      id: bigint;
      city: string;
      district: string;
      property_type: string;
      metric: string;
      period_start: Date;
      period_end: Date;
      value_mean: number;
      value_median: number;
      sample_count: number;
      methodology_json: unknown;
      sources_json: unknown;
      updated_at: Date;
    }>>(Prisma.sql`
      SELECT
        id,
        city,
        district,
        property_type,
        metric,
        period_start,
        period_end,
        value_mean,
        value_median,
        sample_count,
        methodology_json,
        sources_json,
        updated_at
      FROM external_baseline_index
      ${whereClause}
      ORDER BY updated_at DESC
      LIMIT 500
    `);

    return {
      items: rows.map((row) => ({
        id: row.id.toString(),
        city: row.city,
        district: row.district,
        property_type: row.property_type,
        metric: row.metric,
        period_start: row.period_start.toISOString(),
        period_end: row.period_end.toISOString(),
        value_mean: Number(row.value_mean),
        value_median: Number(row.value_median),
        sample_count: Number(row.sample_count),
        methodology_json: this.toRecord(row.methodology_json),
        sources_json: this.toArray(row.sources_json),
        updated_at: row.updated_at.toISOString(),
      })),
    };
  }

  private async prepareObservation(input: {
    sourceId: number;
    city: string;
    district: string;
    propertyType: string;
    metric: string;
    value: number;
    valueUnit?: string;
    url?: string;
    publishedAt?: string;
    rawJson?: unknown;
  }) {
    if (!Number.isInteger(input.sourceId) || input.sourceId <= 0) {
      throw new BadRequestException('source_id must be a positive integer');
    }

    const sourceRows = await this.urbanexPrisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id FROM external_market_sources WHERE id = ${input.sourceId} LIMIT 1
    `);
    if (!sourceRows.length) {
      throw new BadRequestException('source_id not found');
    }

    const normalized = normalizeAreaInput({
      city: input.city,
      district: input.district,
      property_type: input.propertyType,
    });

    if (!normalized.city_norm || !normalized.district_norm || !normalized.property_type_norm) {
      throw new BadRequestException('city/district/property_type are required');
    }

    const metric = this.normalizeMetric(input.metric);
    if (!metric) {
      throw new BadRequestException('metric is required');
    }

    if (!Number.isFinite(input.value) || input.value <= 0) {
      throw new BadRequestException('value must be a positive number');
    }

    const publishedAt = this.parseDate(input.publishedAt) ?? new Date();
    const url = this.cleanString(input.url);
    const valueUnit = this.cleanString(input.valueUnit) ?? 'SYP_PER_M2';

    const ingestHash = this.buildIngestHash({
      sourceId: input.sourceId,
      url,
      metric,
      city: normalized.city_norm,
      district: normalized.district_norm,
      propertyType: normalized.property_type_norm,
      publishedAt,
      value: input.value,
    });

    return {
      source_id: input.sourceId,
      city: normalized.city_norm,
      district: normalized.district_norm,
      property_type: normalized.property_type_norm,
      metric,
      value: input.value,
      value_unit: valueUnit,
      url,
      published_at: publishedAt,
      ingest_hash: ingestHash,
      raw_json: input.rawJson ?? null,
    };
  }

  private async insertObservation(prepared: {
    source_id: number;
    city: string;
    district: string;
    property_type: string;
    metric: string;
    value: number;
    value_unit: string;
    url: string | null;
    published_at: Date;
    ingest_hash: string;
    raw_json: unknown;
  }): Promise<boolean> {
    const exists = await this.urbanexPrisma.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
      SELECT id
      FROM external_market_observations
      WHERE ingest_hash = ${prepared.ingest_hash}
      LIMIT 1
    `);

    if (exists.length > 0) {
      return false;
    }

    await this.urbanexPrisma.$executeRaw(Prisma.sql`
      INSERT INTO external_market_observations
      (
        source_id,
        city,
        district,
        property_type,
        metric,
        value,
        value_unit,
        url,
        published_at,
        ingest_hash,
        raw_json,
        created_at
      )
      VALUES
      (
        ${prepared.source_id},
        ${prepared.city},
        ${prepared.district},
        ${prepared.property_type},
        ${prepared.metric},
        ${prepared.value},
        ${prepared.value_unit},
        ${prepared.url},
        ${prepared.published_at},
        ${prepared.ingest_hash},
        ${prepared.raw_json},
        NOW(3)
      )
    `);

    return true;
  }

  private serializeSource(row: SourceRow) {
    return {
      id: row.id,
      name: row.name,
      source_type: row.source_type,
      base_url: row.base_url,
      reliability_score: Number(row.reliability_score),
      is_active: Boolean(row.is_active),
      methodology_json: this.toRecord(row.methodology_json),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  private normalizeMetric(value: string): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  }

  private normalizeReliability(value?: number): number {
    if (!Number.isFinite(Number(value))) {
      return 1;
    }
    const parsed = Number(value);
    if (parsed < 0) return 0;
    if (parsed > 1) return 1;
    return parsed;
  }

  private cleanString(value?: string | null): string | null {
    const cleaned = String(value || '').trim();
    return cleaned ? cleaned : null;
  }

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  private buildIngestHash(params: {
    sourceId: number;
    url: string | null;
    metric: string;
    city: string;
    district: string;
    propertyType: string;
    publishedAt: Date;
    value: number;
  }): string {
    const publishedDate = params.publishedAt.toISOString().slice(0, 10);
    const stableValue = Number.isInteger(params.value)
      ? String(params.value)
      : params.value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');

    const material = [
      String(params.sourceId),
      params.url || '',
      params.metric,
      params.city,
      params.district,
      params.propertyType,
      publishedDate,
      stableValue,
    ].join('|');

    return createHash('sha1').update(material).digest('hex');
  }

  private resolveMonthsWindow(monthsWindow?: number): number {
    const parsed = Number(monthsWindow ?? 12);
    if (!Number.isInteger(parsed) || parsed < 6 || parsed > 12) {
      throw new BadRequestException('months_window must be an integer between 6 and 12');
    }
    return parsed;
  }

  private computeWeightedMean(values: Array<{ value: number; weight: number }>): number {
    const weighted = values.reduce(
      (acc, item) => {
        acc.sum += item.value * item.weight;
        acc.weight += item.weight;
        return acc;
      },
      { sum: 0, weight: 0 },
    );

    if (weighted.weight <= 0) {
      return 0;
    }

    return Number((weighted.sum / weighted.weight).toFixed(4));
  }

  private computeWeightedMedian(values: Array<{ value: number; weight: number }>): number {
    if (!values.length) return 0;

    const sorted = [...values].sort((a, b) => a.value - b.value);
    const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
    const midpoint = totalWeight / 2;

    let cumulative = 0;
    for (const item of sorted) {
      cumulative += item.weight;
      if (cumulative >= midpoint) {
        return Number(item.value.toFixed(4));
      }
    }

    return Number(sorted[sorted.length - 1].value.toFixed(4));
  }

  private parseCsv(content: string): Array<Record<string, string>> {
    const lines = content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      return [];
    }

    const headers = this.parseCsvLine(lines[0]).map((header) =>
      header.trim().toLowerCase().replace(/\s+/g, '_'),
    );

    const rows: Array<Record<string, string>> = [];
    for (let i = 1; i < lines.length; i += 1) {
      const values = this.parseCsvLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] ?? '';
      });
      rows.push(row);
    }

    return rows;
  }

  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    fields.push(current.trim());
    return fields;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private toArray(value: unknown): unknown[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value;
  }
}
