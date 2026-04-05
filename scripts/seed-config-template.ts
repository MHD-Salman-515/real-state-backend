import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

type Tier = 'ultra' | 'ultra_rif' | 'high' | 'medium' | 'low';
type Group = 'damascus_rif' | 'other_syria';

interface PropertyTypeConfig {
  type: 'apartment' | 'studio' | 'villa' | 'house' | 'land';
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

const OUTPUT_PATH = resolve(process.cwd(), 'data/seed-config.damascus.json');

const DAMASCUS_TYPES: PropertyTypeConfig[] = [
  { type: 'apartment', weight: 0.63, area_min: 70, area_max: 220 },
  { type: 'studio', weight: 0.15, area_min: 25, area_max: 60 },
  { type: 'house', weight: 0.11, area_min: 90, area_max: 260 },
  { type: 'villa', weight: 0.07, area_min: 180, area_max: 520 },
  { type: 'land', weight: 0.04, area_min: 120, area_max: 900 },
];

const RIF_TYPES: PropertyTypeConfig[] = [
  { type: 'apartment', weight: 0.5, area_min: 70, area_max: 210 },
  { type: 'house', weight: 0.23, area_min: 100, area_max: 300 },
  { type: 'land', weight: 0.13, area_min: 140, area_max: 1000 },
  { type: 'studio', weight: 0.09, area_min: 25, area_max: 60 },
  { type: 'villa', weight: 0.05, area_min: 190, area_max: 600 },
];

const OTHER_TYPES: PropertyTypeConfig[] = [
  { type: 'apartment', weight: 0.5, area_min: 60, area_max: 190 },
  { type: 'house', weight: 0.24, area_min: 90, area_max: 270 },
  { type: 'studio', weight: 0.12, area_min: 25, area_max: 55 },
  { type: 'land', weight: 0.1, area_min: 120, area_max: 850 },
  { type: 'villa', weight: 0.04, area_min: 180, area_max: 520 },
];

const config: SeedConfig = {
  seed: 20260303,
  output_csv_path: 'data/market-seed.csv',
  source: 'seed',
  total_rows: 2000,
  damascus_rif_share: 0.85,
  created_at_days_back: 120,
  noise_clamp: {
    min: 0.75,
    max: 1.35,
  },
  districts: [
    // Damascus ultra anchors (required + additional)
    { city: 'damascus', district: 'malki', group: 'damascus_rif', tier: 'ultra', weight: 0.065, district_multiplier: 1.2, sigma: 0.18, property_types: DAMASCUS_TYPES },
    { city: 'damascus', district: 'abu rummaneh', group: 'damascus_rif', tier: 'ultra', weight: 0.065, district_multiplier: 1.18, sigma: 0.18, property_types: DAMASCUS_TYPES },
    { city: 'damascus', district: 'muhajireen', group: 'damascus_rif', tier: 'ultra', weight: 0.06, district_multiplier: 1.13, sigma: 0.17, property_types: DAMASCUS_TYPES },
    { city: 'damascus', district: 'baghdad', group: 'damascus_rif', tier: 'ultra', weight: 0.055, district_multiplier: 1.09, sigma: 0.17, property_types: DAMASCUS_TYPES },
    { city: 'damascus', district: 'shaalaan', group: 'damascus_rif', tier: 'ultra', weight: 0.055, district_multiplier: 1.1, sigma: 0.16, property_types: DAMASCUS_TYPES },
    { city: 'damascus', district: 'hay al ameen', group: 'damascus_rif', tier: 'ultra', weight: 0.048, district_multiplier: 1.04, sigma: 0.16, property_types: DAMASCUS_TYPES },
    { city: 'damascus', district: 'khaled ibn al walid', group: 'damascus_rif', tier: 'ultra', weight: 0.052, district_multiplier: 1.03, sigma: 0.17, property_types: DAMASCUS_TYPES },
    { city: 'damascus', district: 'mashrou dummar', group: 'damascus_rif', tier: 'ultra', weight: 0.058, district_multiplier: 1.08, sigma: 0.17, property_types: DAMASCUS_TYPES },
    { city: 'damascus', district: 'mazzeh', group: 'damascus_rif', tier: 'high', weight: 0.075, district_multiplier: 1.04, sigma: 0.18, property_types: DAMASCUS_TYPES },
    { city: 'damascus', district: 'kafr sousa', group: 'damascus_rif', tier: 'high', weight: 0.062, district_multiplier: 1.0, sigma: 0.17, property_types: DAMASCUS_TYPES },
    { city: 'damascus', district: 'rukn al-din', group: 'damascus_rif', tier: 'medium', weight: 0.045, district_multiplier: 0.95, sigma: 0.18, property_types: DAMASCUS_TYPES },
    { city: 'damascus', district: 'midan', group: 'damascus_rif', tier: 'medium', weight: 0.04, district_multiplier: 0.92, sigma: 0.19, property_types: DAMASCUS_TYPES },

    // Rif Dimashq anchors (required + additional)
    { city: 'rif dimashq', district: 'qudsaya project', group: 'damascus_rif', tier: 'ultra_rif', weight: 0.08, district_multiplier: 1.08, sigma: 0.18, property_types: RIF_TYPES },
    { city: 'rif dimashq', district: 'jadidat al sheibani', group: 'damascus_rif', tier: 'high', weight: 0.045, district_multiplier: 1.0, sigma: 0.18, property_types: RIF_TYPES },
    { city: 'rif dimashq', district: 'artouz', group: 'damascus_rif', tier: 'high', weight: 0.05, district_multiplier: 0.98, sigma: 0.18, property_types: RIF_TYPES },
    { city: 'rif dimashq', district: 'sahnaya', group: 'damascus_rif', tier: 'high', weight: 0.052, district_multiplier: 0.97, sigma: 0.18, property_types: RIF_TYPES },
    { city: 'rif dimashq', district: 'jaramana', group: 'damascus_rif', tier: 'medium', weight: 0.07, district_multiplier: 0.9, sigma: 0.2, property_types: RIF_TYPES },
    { city: 'rif dimashq', district: 'mleiha', group: 'damascus_rif', tier: 'medium', weight: 0.05, district_multiplier: 0.86, sigma: 0.2, property_types: RIF_TYPES },
    { city: 'rif dimashq', district: 'darayya', group: 'damascus_rif', tier: 'high', weight: 0.043, district_multiplier: 0.96, sigma: 0.18, property_types: RIF_TYPES },
    { city: 'rif dimashq', district: 'harasta', group: 'damascus_rif', tier: 'medium', weight: 0.03, district_multiplier: 0.88, sigma: 0.2, property_types: RIF_TYPES },

    // Light test coverage for other Syrian cities
    { city: 'aleppo', district: 'aziziyeh', group: 'other_syria', tier: 'medium', weight: 0.24, district_multiplier: 0.95, sigma: 0.2, property_types: OTHER_TYPES },
    { city: 'homs', district: 'al waer', group: 'other_syria', tier: 'low', weight: 0.2, district_multiplier: 0.9, sigma: 0.21, property_types: OTHER_TYPES },
    { city: 'latakia', district: 'project 7', group: 'other_syria', tier: 'high', weight: 0.2, district_multiplier: 0.96, sigma: 0.19, property_types: OTHER_TYPES },
    { city: 'tartus', district: 'al raml', group: 'other_syria', tier: 'medium', weight: 0.18, district_multiplier: 0.93, sigma: 0.2, property_types: OTHER_TYPES },
    { city: 'hama', district: 'al hamidiyah', group: 'other_syria', tier: 'low', weight: 0.18, district_multiplier: 0.9, sigma: 0.21, property_types: OTHER_TYPES },
  ],
};

async function main() {
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  console.log(`Wrote seed config: ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error('Failed to write seed config:', error);
  process.exitCode = 1;
});
