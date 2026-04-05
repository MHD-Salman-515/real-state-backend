import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { normalizeAreaInput } from '../src/advisor/utils/area-normalization';

interface CsvRow {
  city: string;
  district: string;
  property_type: string;
  area_m2: string;
  price_syp: string;
  price_usd: string;
  source: string;
  created_at: string;
}

interface PreparedRow {
  city: string;
  district: string;
  property_type: string;
  area_m2: number;
  price_syp: number;
  price_usd: number;
  price_per_m2_syp: number;
  price_per_m2: number;
  source: string;
  fx_usd_to_syp: number;
  fx_source: string | null;
  created_at: Date;
}

interface AggregateStats {
  sumUsdPerM2: number;
  sumSypPerM2: number;
  count: number;
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

function parseCsv(content: string): CsvRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  const required = [
    'city',
    'district',
    'property_type',
    'area_m2',
    'price_syp',
    'price_usd',
    'source',
    'created_at',
  ];

  for (const key of required) {
    if (!headers.includes(key)) {
      throw new Error(`CSV is missing required header: ${key}`);
    }
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    rows.push({
      city: values[headers.indexOf('city')] ?? '',
      district: values[headers.indexOf('district')] ?? '',
      property_type: values[headers.indexOf('property_type')] ?? '',
      area_m2: values[headers.indexOf('area_m2')] ?? '',
      price_syp: values[headers.indexOf('price_syp')] ?? '',
      price_usd: values[headers.indexOf('price_usd')] ?? '',
      source: values[headers.indexOf('source')] ?? '',
      created_at: values[headers.indexOf('created_at')] ?? '',
    });
  }

  return rows;
}

function parsePositive(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseDateOrNow(value: string): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function getUrbanexDatabaseUrl(): string {
  const url = process.env.URBANEX_DATABASE_URL;
  if (!url) {
    throw new Error('URBANEX_DATABASE_URL is required for seeding urbanex_ai');
  }
  return url;
}

async function main() {
  const csvPath = resolve(process.cwd(), process.argv[2] || 'data/market-seed.csv');
  const prisma = new PrismaClient({
    datasources: { db: { url: getUrbanexDatabaseUrl() } },
  });

  try {
    const csvContent = await readFile(csvPath, 'utf8');
    const rows = parseCsv(csvContent);

    const latestFx = await prisma.fxRate.findFirst({
      where: { effective_at: { lte: new Date() } },
      orderBy: { effective_at: 'desc' },
    });

    if (!latestFx) {
      throw new Error('No fx_rates row found with effective_at <= NOW()');
    }

    const fx = Number(latestFx.usd_to_syp);
    if (!Number.isFinite(fx) || fx <= 0) {
      throw new Error('Latest fx_rates.usd_to_syp is invalid');
    }

    let skipped = 0;
    let errors = 0;
    const prepared: PreparedRow[] = [];

    for (const row of rows) {
      try {
        const normalized = normalizeAreaInput({
          city: row.city,
          district: row.district,
          property_type: row.property_type,
        });

        const city = normalized.city_norm;
        const district = normalized.district_norm;
        const propertyType = normalized.property_type_norm;
        const areaM2 = parsePositive(row.area_m2);
        let priceSyp = parsePositive(row.price_syp);
        let priceUsd = parsePositive(row.price_usd);

        if (!city || !district || !propertyType || !areaM2) {
          skipped += 1;
          continue;
        }

        if (!priceSyp && !priceUsd) {
          skipped += 1;
          continue;
        }

        if (!priceSyp && priceUsd) {
          priceSyp = Math.round(priceUsd * fx);
        } else if (!priceUsd && priceSyp) {
          priceUsd = priceSyp / fx;
        }

        if (!priceSyp || !priceUsd) {
          skipped += 1;
          continue;
        }

        const pricePerM2Usd = priceUsd / areaM2;
        const pricePerM2Syp = priceSyp / areaM2;

        prepared.push({
          city,
          district,
          property_type: propertyType,
          area_m2: areaM2,
          price_syp: priceSyp,
          price_usd: priceUsd,
          price_per_m2: pricePerM2Usd,
          price_per_m2_syp: pricePerM2Syp,
          source: row.source?.trim() || 'seed',
          fx_usd_to_syp: fx,
          fx_source: latestFx.source ?? 'fx_rates',
          created_at: parseDateOrNow(row.created_at),
        });
      } catch {
        errors += 1;
      }
    }

    for (const chunk of chunked(prepared, 500)) {
      await prisma.marketData.createMany({
        data: chunk.map((item) => ({
          city: item.city,
          district: item.district,
          property_type: item.property_type,
          area_m2: item.area_m2,
          price_syp: item.price_syp,
          price_usd: item.price_usd,
          price_per_m2: item.price_per_m2,
          price_per_m2_syp: item.price_per_m2_syp,
          source: item.source,
          fx_usd_to_syp: item.fx_usd_to_syp,
          fx_source: item.fx_source,
          created_at: item.created_at,
          address: null,
        })),
      });
    }

    const allRows = await prisma.marketData.findMany({
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

    const aggregates = new Map<string, AggregateStats>();
    for (const row of allRows) {
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
        continue;
      }

      const areaM2 = Number(row.area_m2);
      if (!Number.isFinite(areaM2) || areaM2 <= 0) {
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

    for (const [areaKey, stats] of aggregates.entries()) {
      const [city, district, propertyType] = areaKey.split('|');
      await prisma.areasPrice.upsert({
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
          fx_source: latestFx.source ?? 'fx_rates',
          updated_at: new Date(),
        },
        update: {
          avg_price_per_m2: stats.sumUsdPerM2 / stats.count,
          avg_price_per_m2_syp: stats.sumSypPerM2 / stats.count,
          sample_count: stats.count,
          fx_usd_to_syp: fx,
          fx_source: latestFx.source ?? 'fx_rates',
          updated_at: new Date(),
        },
      });
    }

    const topKeys = [...aggregates.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([areaKey, stats]) => `${areaKey} => ${stats.count}`);

    console.log('Seeding summary');
    console.log(`CSV rows: ${rows.length}`);
    console.log(`Inserted: ${prepared.length}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`Aggregated area keys: ${aggregates.size}`);
    console.log('Top 10 area_keys by sample_count:');
    for (const line of topKeys) {
      console.log(`- ${line}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to seed market_data:', error);
  process.exitCode = 1;
});
