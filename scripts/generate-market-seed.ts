import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { normalizeAreaInput } from '../src/advisor/utils/area-normalization';

type Tier = 'ultra' | 'ultra_rif' | 'high' | 'medium' | 'low';
type Group = 'damascus_rif' | 'other_syria';
type PropertyType = 'apartment' | 'studio' | 'villa' | 'house' | 'land';
type Condition = 'new' | 'good' | 'needs_work';

interface PropertyTypeConfig {
  type: PropertyType;
  weight: number;
  area_min: number;
  area_max: number;
}

interface DistrictConfig {
  city: string;
  district: string;
  group: Group;
  tier: Tier;
  weight: number;
  district_multiplier: number;
  sigma: number;
  property_types: PropertyTypeConfig[];
}

interface SeedConfig {
  seed: number;
  output_csv_path: string;
  source: string;
  total_rows: number;
  damascus_rif_share: number;
  created_at_days_back: number;
  noise_clamp: {
    min: number;
    max: number;
  };
  districts: DistrictConfig[];
}

interface SeedRow {
  city: string;
  district: string;
  property_type: string;
  area_m2: number;
  price_syp: number;
  price_usd: null;
  source: string;
  created_at: string;
}

const CONFIG_PATH = resolve(process.cwd(), 'data/seed-config.damascus.json');

const TIER_BASE_PPM2_SYP: Record<Tier, Record<PropertyType, number>> = {
  ultra: {
    apartment: 8_600_000,
    studio: 9_400_000,
    villa: 11_800_000,
    house: 7_400_000,
    land: 5_200_000,
  },
  ultra_rif: {
    apartment: 7_900_000,
    studio: 8_500_000,
    villa: 10_700_000,
    house: 6_900_000,
    land: 4_700_000,
  },
  high: {
    apartment: 5_400_000,
    studio: 6_100_000,
    villa: 8_100_000,
    house: 4_800_000,
    land: 3_100_000,
  },
  medium: {
    apartment: 3_100_000,
    studio: 3_600_000,
    villa: 5_500_000,
    house: 2_800_000,
    land: 1_850_000,
  },
  low: {
    apartment: 1_950_000,
    studio: 2_250_000,
    villa: 3_700_000,
    house: 1_700_000,
    land: 1_120_000,
  },
};

const CONDITION_MULTIPLIER: Record<Condition, number> = {
  new: 1.08,
  good: 1.0,
  needs_work: 0.92,
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick<T extends { weight: number }>(items: T[], rand: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const threshold = rand() * total;
  let running = 0;
  for (const item of items) {
    running += item.weight;
    if (threshold <= running) return item;
  }
  return items[items.length - 1];
}

function gaussian(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function sampleInteger(min: number, max: number, rand: () => number): number {
  return Math.floor(min + rand() * (max - min + 1));
}

function sampleCondition(ageYears: number, rand: () => number): Condition {
  const r = rand();
  if (ageYears <= 5) {
    if (r < 0.6) return 'new';
    if (r < 0.95) return 'good';
    return 'needs_work';
  }
  if (ageYears <= 15) {
    if (r < 0.2) return 'new';
    if (r < 0.85) return 'good';
    return 'needs_work';
  }
  if (r < 0.05) return 'new';
  if (r < 0.65) return 'good';
  return 'needs_work';
}

function sampleCreatedAt(daysBack: number, rand: () => number): string {
  const now = Date.now();
  const dayOffset = Math.floor(rand() * daysBack);
  const secondOffset = Math.floor(rand() * 86400);
  return new Date(now - dayOffset * 86400_000 - secondOffset * 1000).toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function floorEffect(type: PropertyType, rand: () => number): number {
  if (type !== 'apartment' && type !== 'studio') {
    return 1;
  }
  const floor = sampleInteger(1, 8, rand);
  return clamp(1 + (floor - 4) * 0.01, 0.95, 1.05);
}

function readConfigOrThrow(raw: string): SeedConfig {
  const parsed = JSON.parse(raw) as SeedConfig;
  if (!Array.isArray(parsed.districts) || parsed.districts.length === 0) {
    throw new Error('seed-config.damascus.json has no districts');
  }
  return parsed;
}

function toCsv(rows: SeedRow[]): string {
  const headers = [
    'city',
    'district',
    'property_type',
    'area_m2',
    'price_syp',
    'price_usd',
    'source',
    'created_at',
  ];

  const escape = (value: string | number | null) => {
    if (value == null) return '';
    const raw = String(value);
    if (!/[",\n]/.test(raw)) return raw;
    return `"${raw.replace(/"/g, '""')}"`;
  };

  const body = rows.map((row) =>
    [
      row.city,
      row.district,
      row.property_type,
      row.area_m2,
      row.price_syp,
      row.price_usd,
      row.source,
      row.created_at,
    ]
      .map(escape)
      .join(','),
  );

  return `${headers.join(',')}\n${body.join('\n')}\n`;
}

function buildRow(params: {
  config: SeedConfig;
  district: DistrictConfig;
  rand: () => number;
}): SeedRow | null {
  const pickedType = weightedPick(params.district.property_types, params.rand);
  const area = sampleInteger(pickedType.area_min, pickedType.area_max, params.rand);
  const ageYears = sampleInteger(0, 30, params.rand);
  const condition = sampleCondition(ageYears, params.rand);

  const tierBase = TIER_BASE_PPM2_SYP[params.district.tier][pickedType.type];
  const ppm2Syp = tierBase * params.district.district_multiplier;
  const noise = clamp(
    Math.exp(gaussian(params.rand) * params.district.sigma),
    params.config.noise_clamp.min,
    params.config.noise_clamp.max,
  );

  const rawPrice =
    ppm2Syp *
    area *
    noise *
    CONDITION_MULTIPLIER[condition] *
    floorEffect(pickedType.type, params.rand);

  const normalized = normalizeAreaInput({
    city: params.district.city,
    district: params.district.district,
    property_type: pickedType.type,
  });

  if (!normalized.city_norm || !normalized.district_norm || !normalized.property_type_norm) {
    return null;
  }

  return {
    city: normalized.city_norm,
    district: normalized.district_norm,
    property_type: normalized.property_type_norm,
    area_m2: area,
    price_syp: Math.round(rawPrice),
    price_usd: null,
    source: params.config.source || 'seed',
    created_at: sampleCreatedAt(params.config.created_at_days_back, params.rand),
  };
}

async function main() {
  const configRaw = await readFile(CONFIG_PATH, 'utf8');
  const config = readConfigOrThrow(configRaw);
  const rand = mulberry32(config.seed);

  const mainDistricts = config.districts.filter((d) => d.group === 'damascus_rif');
  const otherDistricts = config.districts.filter((d) => d.group === 'other_syria');

  const mainTarget = Math.round(config.total_rows * config.damascus_rif_share);
  const otherTarget = config.total_rows - mainTarget;

  const rows: SeedRow[] = [];
  let skipped = 0;

  for (let i = 0; i < mainTarget; i += 1) {
    const district = weightedPick(mainDistricts, rand);
    const row = buildRow({ config, district, rand });
    if (row) rows.push(row);
    else skipped += 1;
  }

  for (let i = 0; i < otherTarget; i += 1) {
    const district = weightedPick(otherDistricts, rand);
    const row = buildRow({ config, district, rand });
    if (row) rows.push(row);
    else skipped += 1;
  }

  const outputPath = resolve(process.cwd(), config.output_csv_path || 'data/market-seed.csv');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, toCsv(rows), 'utf8');

  console.log(`Generated ${rows.length} rows -> ${outputPath}`);
  console.log(`Damascus + Rif target: ${mainTarget}`);
  console.log(`Other Syria target: ${otherTarget}`);
  console.log(`Skipped rows due to normalization/validation: ${skipped}`);
}

main().catch((error) => {
  console.error('Failed to generate market seed CSV:', error);
  process.exitCode = 1;
});
