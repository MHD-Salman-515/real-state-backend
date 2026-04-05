import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { normalizeAreaInput } from '../src/advisor/utils/area-normalization';

interface ParsedRow {
  city: string;
  district: string;
  property_type: string;
  area_m2: string;
  price_syp: string;
  price_usd: string;
  created_at: string;
  source: string;
}

interface PreparedRow {
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

interface RebuildSummary {
  source_rows: number;
  aggregated_area_keys: number;
  upserted_rows: number;
  skipped_rows: number;
}

function parseCsvLine(line: string): string[] {
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

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function pickValue(
  row: Record<string, string>,
  aliases: string[],
): string {
  for (const key of aliases) {
    const value = row[key];
    if (value != null) {
      return value;
    }
  }
  return '';
}

function parseCsv(content: string): ParsedRow[] {
  const lines = content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const raw = Object.fromEntries(
      headers.map((header, idx) => [header, (values[idx] ?? '').trim()]),
    );

    rows.push({
      city: pickValue(raw, ['city']),
      district: pickValue(raw, ['district']),
      property_type: pickValue(raw, ['property_type', 'propertytype', 'type']),
      area_m2: pickValue(raw, ['area_m2', 'area', 'sqm']),
      price_syp: pickValue(raw, ['price_syp', 'syp', 'price']),
      price_usd: pickValue(raw, ['price_usd', 'usd']),
      created_at: pickValue(raw, ['created_at', 'createdat', 'date']),
      source: pickValue(raw, ['source']),
    });
  }

  return rows;
}

function parsePositive(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

function parseCreatedAt(value: string): Date {
  if (!value || !value.trim()) {
    return new Date();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function stableNumberString(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function buildIngestHash(params: {
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
    stableNumberString(params.area_m2),
    stableNumberString(params.price_syp),
    date,
  ].join('|');
  return createHash('sha1').update(payload).digest('hex');
}

function getUrbanexDatabaseUrl(): string {
  const value = process.env.URBANEX_DATABASE_URL;
  if (!value) {
    throw new Error('URBANEX_DATABASE_URL is required');
  }
  return value;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function rebuildAreas(
  prisma: PrismaClient,
  fx: number,
  fxSource: string | null,
  days: number,
): Promise<RebuildSummary> {
  const from = new Date();
  from.setDate(from.getDate() - days);

  const rows = await prisma.marketData.findMany({
    where: { created_at: { gte: from } },
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
  });

  const aggregates = new Map<string, { sumUsdPerM2: number; sumSypPerM2: number; count: number }>();
  let skipped = 0;

  for (const row of rows) {
    const normalized = normalizeAreaInput({
      city: row.city,
      district: row.district,
      property_type: row.property_type,
    });
    if (!normalized.city_norm || !normalized.district_norm || !normalized.property_type_norm) {
      skipped += 1;
      continue;
    }

    const area = Number(row.area_m2);
    if (!Number.isFinite(area) || area < 1) {
      skipped += 1;
      continue;
    }

    const usdPerM2Direct = Number(row.price_per_m2);
    const sypPerM2Direct = Number(row.price_per_m2_syp);
    const usdPerM2FromUsd =
      Number.isFinite(Number(row.price_usd)) && Number(row.price_usd) > 0
        ? Number(row.price_usd) / area
        : null;
    const sypPerM2FromSyp =
      Number.isFinite(Number(row.price_syp)) && Number(row.price_syp) > 0
        ? Number(row.price_syp) / area
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

    const key = `${normalized.city_norm}|${normalized.district_norm}|${normalized.property_type_norm}`;
    const stats = aggregates.get(key) ?? { sumUsdPerM2: 0, sumSypPerM2: 0, count: 0 };
    stats.sumUsdPerM2 += usdPerM2;
    stats.sumSypPerM2 += sypPerM2;
    stats.count += 1;
    aggregates.set(key, stats);
  }

  const now = new Date();
  const operations: Array<Prisma.PrismaPromise<unknown>> = [];
  for (const [key, stats] of aggregates.entries()) {
    const [city, district, propertyType] = key.split('|');
    operations.push(
      prisma.areasPrice.upsert({
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
          fx_source: fxSource ?? 'fx_rates',
          updated_at: now,
        },
        update: {
          avg_price_per_m2: stats.sumUsdPerM2 / stats.count,
          avg_price_per_m2_syp: stats.sumSypPerM2 / stats.count,
          sample_count: stats.count,
          fx_usd_to_syp: fx,
          fx_source: fxSource ?? 'fx_rates',
          updated_at: now,
        },
      }),
    );
  }

  for (const ops of chunk(operations, 200)) {
    await prisma.$transaction(ops);
  }

  return {
    source_rows: rows.length,
    aggregated_area_keys: aggregates.size,
    upserted_rows: operations.length,
    skipped_rows: skipped,
  };
}

async function main() {
  const argPath = process.argv[2];
  if (!argPath) {
    console.error('Usage: npm run market:import -- data/real-market.csv');
    process.exitCode = 1;
    return;
  }

  const csvPath = resolve(process.cwd(), argPath);
  const prisma = new PrismaClient({
    datasources: { db: { url: getUrbanexDatabaseUrl() } },
  });

  try {
    const csv = await readFile(csvPath, 'utf8');
    const parsedRows = parseCsv(csv);

    const fxRow = await prisma.fxRate.findFirst({
      where: { effective_at: { lte: new Date() } },
      orderBy: { effective_at: 'desc' },
    });
    if (!fxRow) {
      throw new Error('No fx_rates row found with effective_at <= NOW()');
    }
    const fx = Number(fxRow.usd_to_syp);
    if (!Number.isFinite(fx) || fx <= 0) {
      throw new Error('Invalid fx_rates.usd_to_syp value');
    }

    const prepared: PreparedRow[] = [];
    let invalid = 0;
    let skipped = 0;

    for (const row of parsedRows) {
      const normalized = normalizeAreaInput({
        city: row.city,
        district: row.district,
        property_type: row.property_type,
      });

      const city = normalized.city_norm;
      const district = normalized.district_norm;
      const propertyType = normalized.property_type_norm;
      const area = parsePositive(row.area_m2);
      let priceSyp = parsePositive(row.price_syp);
      let priceUsd = parsePositive(row.price_usd);
      const createdAt = parseCreatedAt(row.created_at);

      if (!city || !district || !propertyType || !area || area < 1) {
        invalid += 1;
        continue;
      }
      if (!priceSyp && !priceUsd) {
        invalid += 1;
        continue;
      }

      if (!priceSyp && priceUsd) {
        priceSyp = Math.round(priceUsd * fx);
      } else if (!priceUsd && priceSyp) {
        priceUsd = priceSyp / fx;
      }

      if (!priceSyp || !priceUsd || priceSyp <= 0 || priceUsd <= 0) {
        invalid += 1;
        continue;
      }

      const ingestHash = buildIngestHash({
        city,
        district,
        property_type: propertyType,
        area_m2: area,
        price_syp: priceSyp,
        created_at: createdAt,
      });

      prepared.push({
        city,
        district,
        property_type: propertyType,
        area_m2: area,
        price_syp: priceSyp,
        price_usd: priceUsd,
        price_per_m2: priceUsd / area,
        price_per_m2_syp: priceSyp / area,
        source: row.source?.trim() || 'import',
        created_at: createdAt,
        fx_usd_to_syp: fx,
        fx_source: fxRow.source ?? 'fx_rates',
        ingest_hash: ingestHash,
      });
    }

    let inserted = 0;
    for (const rows of chunk(prepared, 500)) {
      const result = await prisma.marketData.createMany({
        data: rows.map((item) => ({
          city: item.city,
          district: item.district,
          property_type: item.property_type,
          area_m2: item.area_m2,
          price_syp: item.price_syp,
          price_usd: item.price_usd,
          price_per_m2: item.price_per_m2,
          price_per_m2_syp: item.price_per_m2_syp,
          source: item.source,
          created_at: item.created_at,
          fx_usd_to_syp: item.fx_usd_to_syp,
          fx_source: item.fx_source,
          ingest_hash: item.ingest_hash,
          address: null,
          raw_json: Prisma.DbNull,
        })),
        skipDuplicates: true,
      });
      inserted += result.count;
      skipped += rows.length - result.count;
    }

    const rebuild = await rebuildAreas(prisma, fx, fxRow.source ?? 'fx_rates', 120);

    console.log('Import summary');
    console.log(`CSV rows: ${parsedRows.length}`);
    console.log(`Inserted: ${inserted}`);
    console.log(`Skipped (duplicates): ${skipped}`);
    console.log(`Invalid: ${invalid}`);
    console.log('Rebuild summary (last 120 days)');
    console.log(`- source_rows: ${rebuild.source_rows}`);
    console.log(`- aggregated_area_keys: ${rebuild.aggregated_area_keys}`);
    console.log(`- upserted_rows: ${rebuild.upserted_rows}`);
    console.log(`- skipped_rows: ${rebuild.skipped_rows}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to import market CSV:', error);
  process.exitCode = 1;
});
