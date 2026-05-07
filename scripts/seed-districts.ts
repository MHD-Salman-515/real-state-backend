import * as dotenv from 'dotenv';
import * as path from 'path';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DISTRICTS = [
  // Damascus — Ultra tier (isOrganized = true)
  { nameAr: 'المالكي',           nameEn: 'malki',                city: 'damascus',    tier: 'ultra',  priceMultiplier: 1.35, lat: 33.5138, lng: 36.2765, isOrganized: true },
  { nameAr: 'أبو رمانة',         nameEn: 'abu rummaneh',         city: 'damascus',    tier: 'ultra',  priceMultiplier: 1.32, lat: 33.5115, lng: 36.2820, isOrganized: true },
  { nameAr: 'المهاجرين',         nameEn: 'muhajireen',           city: 'damascus',    tier: 'ultra',  priceMultiplier: 1.30, lat: 33.5198, lng: 36.2751, isOrganized: true },
  { nameAr: 'بغداد',             nameEn: 'baghdad',              city: 'damascus',    tier: 'ultra',  priceMultiplier: 1.28, lat: 33.5089, lng: 36.2912, isOrganized: true },
  { nameAr: 'الشعلان',           nameEn: 'shaalaan',             city: 'damascus',    tier: 'ultra',  priceMultiplier: 1.28, lat: 33.5072, lng: 36.2889, isOrganized: true },
  { nameAr: 'حي الأمين',         nameEn: 'hay al ameen',         city: 'damascus',    tier: 'ultra',  priceMultiplier: 1.25, lat: 33.5055, lng: 36.2950, isOrganized: true },
  { nameAr: 'خالد بن الوليد',    nameEn: 'khaled ibn al walid',  city: 'damascus',    tier: 'ultra',  priceMultiplier: 1.27, lat: 33.5060, lng: 36.2930, isOrganized: true },
  { nameAr: 'مشروع دمر',         nameEn: 'mashrou dummar',       city: 'damascus',    tier: 'ultra',  priceMultiplier: 1.26, lat: 33.5312, lng: 36.2201, isOrganized: true },
  // Damascus — High tier
  { nameAr: 'المزة',             nameEn: 'mazzeh',               city: 'damascus',    tier: 'high',   priceMultiplier: 1.20, lat: 33.4985, lng: 36.2612, isOrganized: true },
  { nameAr: 'كفرسوسة',           nameEn: 'kafr sousa',           city: 'damascus',    tier: 'high',   priceMultiplier: 1.18, lat: 33.4921, lng: 36.2734, isOrganized: true },
  { nameAr: 'الصالحية',          nameEn: 'salihiyeh',            city: 'damascus',    tier: 'high',   priceMultiplier: 1.15, lat: 33.5201, lng: 36.2812, isOrganized: true },
  { nameAr: 'الروضة',            nameEn: 'rawda',                city: 'damascus',    tier: 'high',   priceMultiplier: 1.15, lat: 33.5098, lng: 36.2878, isOrganized: true },
  // Damascus — Medium tier
  { nameAr: 'ركن الدين',         nameEn: 'rukn al-din',          city: 'damascus',    tier: 'medium', priceMultiplier: 1.08, lat: 33.5289, lng: 36.2934, isOrganized: true },
  { nameAr: 'الميدان',           nameEn: 'midan',                city: 'damascus',    tier: 'medium', priceMultiplier: 1.05, lat: 33.4934, lng: 36.3012, isOrganized: true },
  { nameAr: 'البرامكة',          nameEn: 'baramkeh',             city: 'damascus',    tier: 'medium', priceMultiplier: 1.05, lat: 33.5034, lng: 36.3089, isOrganized: true },
  { nameAr: 'القصاع',            nameEn: 'qassaa',               city: 'damascus',    tier: 'medium', priceMultiplier: 1.03, lat: 33.5145, lng: 36.3134, isOrganized: true },
  // Damascus — Historic
  { nameAr: 'دمشق القديمة',      nameEn: 'old damascus',         city: 'damascus',    tier: 'medium', priceMultiplier: 1.02, lat: 33.5114, lng: 36.3062, isOrganized: true },
  { nameAr: 'باب شرقي',          nameEn: 'bab sharqi',           city: 'damascus',    tier: 'medium', priceMultiplier: 1.00, lat: 33.5098, lng: 36.3121, isOrganized: true },
  // Damascus — Low tier
  { nameAr: 'جوبر',              nameEn: 'jobar',                city: 'damascus',    tier: 'low',    priceMultiplier: 0.85, lat: 33.5198, lng: 36.3312, isOrganized: false },
  { nameAr: 'التضامن',           nameEn: 'tadamon',              city: 'damascus',    tier: 'low',    priceMultiplier: 0.80, lat: 33.4812, lng: 36.3198, isOrganized: false },
  { nameAr: 'القدم',             nameEn: 'qadam',                city: 'damascus',    tier: 'low',    priceMultiplier: 0.80, lat: 33.4778, lng: 36.3089, isOrganized: false },
  // Rif Dimashq — Mid tier
  { nameAr: 'ضاحية قدسيا',       nameEn: 'qudsaya project',      city: 'rif dimashq', tier: 'medium', priceMultiplier: 1.10, lat: 33.5512, lng: 36.2334, isOrganized: true },
  { nameAr: 'جرمانا',            nameEn: 'jaramana',             city: 'rif dimashq', tier: 'medium', priceMultiplier: 1.00, lat: 33.4812, lng: 36.3512, isOrganized: false },
  { nameAr: 'داريا',             nameEn: 'darayya',              city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.95, lat: 33.4601, lng: 36.2445, isOrganized: true },
  { nameAr: 'حرستا',             nameEn: 'harasta',              city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.90, lat: 33.5534, lng: 36.3712, isOrganized: false },
  { nameAr: 'جديدة الشيباني',    nameEn: 'jadidat al sheibani',  city: 'rif dimashq', tier: 'medium', priceMultiplier: 0.92, lat: 33.4723, lng: 36.2812, isOrganized: true },
  { nameAr: 'عرطوز',             nameEn: 'artouz',               city: 'rif dimashq', tier: 'low',    priceMultiplier: 0.85, lat: 33.4534, lng: 36.2112, isOrganized: false },
  { nameAr: 'صحنايا',            nameEn: 'sahnaya',              city: 'rif dimashq', tier: 'low',    priceMultiplier: 0.83, lat: 33.4423, lng: 36.2334, isOrganized: false },
  { nameAr: 'المليحة',           nameEn: 'mleiha',               city: 'rif dimashq', tier: 'low',    priceMultiplier: 0.82, lat: 33.4712, lng: 36.3834, isOrganized: false },
  // Aleppo
  { nameAr: 'العزيزية',          nameEn: 'aziziyeh',             city: 'aleppo',      tier: 'medium', priceMultiplier: 1.05, lat: 36.2012, lng: 37.1534, isOrganized: true },
  { nameAr: 'الحمدانية',         nameEn: 'hamdaniyeh',           city: 'aleppo',      tier: 'high',   priceMultiplier: 1.15, lat: 36.1934, lng: 37.1312, isOrganized: true },
  // Homs
  { nameAr: 'الوعر',             nameEn: 'al waer',              city: 'homs',        tier: 'medium', priceMultiplier: 0.90, lat: 34.7312, lng: 36.6834, isOrganized: false },
  { nameAr: 'الحميدية',          nameEn: 'al hamidiyah',         city: 'homs',        tier: 'medium', priceMultiplier: 1.00, lat: 34.7412, lng: 36.7112, isOrganized: true },
];

function parseDbUrl(raw: string): mysql.ConnectionOptions {
  const u = new URL(raw);
  const opts: mysql.ConnectionOptions = {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
  if (u.searchParams.get('ssl-mode') === 'REQUIRED') opts.ssl = {};
  return opts;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  const conn = await mysql.createConnection(parseDbUrl(dbUrl));

  try {
    let inserted = 0;
    let skipped = 0;

    for (const d of DISTRICTS) {
      const [existing] = await conn.execute(
        'SELECT id FROM `districts` WHERE nameEn = ? AND city = ?',
        [d.nameEn, d.city],
      );
      if ((existing as any[]).length > 0) { skipped++; continue; }

      await conn.execute(
        `INSERT INTO \`districts\` (nameAr, nameEn, city, tier, priceMultiplier, lat, lng, isOrganized)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.nameAr, d.nameEn, d.city, d.tier, d.priceMultiplier, d.lat ?? null, d.lng ?? null, d.isOrganized ? 1 : 0],
      );
      inserted++;
    }

    console.log(`Done. Inserted: ${inserted}, Skipped (already exist): ${skipped}`);
  } finally {
    await conn.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
