import * as dotenv from 'dotenv';
import * as path from 'path';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ---------------------------------------------------------------------------
// URL pools – 20 curated Unsplash photos per room type
// ---------------------------------------------------------------------------

const ROOM_POOLS: Record<string, string[]> = {
  EXTERIOR: [
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200',
    'https://images.unsplash.com/photo-1507149833265-60c372daea22?w=1200',
    'https://images.unsplash.com/photo-1460317442991-0ec209397118?w=1200',
    'https://images.unsplash.com/photo-1491933382434-500287f9b54b?w=1200',
    'https://images.unsplash.com/photo-1479839672679-a46483c0e7c8?w=1200',
    'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?w=1200',
    'https://images.unsplash.com/photo-1501876725168-00c445821c9e?w=1200',
    'https://images.unsplash.com/photo-1487017159836-4e23ece2e4cf?w=1200',
    'https://images.unsplash.com/photo-1481277542470-605612bd2d61?w=1200',
    'https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=1200',
    'https://images.unsplash.com/photo-1523413651479-597eb2da0ad6?w=1200',
    'https://images.unsplash.com/photo-1522444195799-478538b28823?w=1200',
    'https://images.unsplash.com/photo-1495435229349-e86db7bfa013?w=1200',
    'https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=1200',
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200',
  ],
  LIVING: [
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200',
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6d0267?w=1200',
    'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200',
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200',
    'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1200',
    'https://images.unsplash.com/photo-1493666438817-866a91353ca9?w=1200',
    'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200',
    'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=1200',
    'https://images.unsplash.com/photo-1501183638710-841dd1904471?w=1200',
    'https://images.unsplash.com/photo-1464890100898-a385f744067f?w=1200',
    'https://images.unsplash.com/photo-1494526585095-c41746248156?w=1200',
    'https://images.unsplash.com/photo-1472224371017-08207f84aaae?w=1200',
  ],
  BEDROOM: [
    'https://images.unsplash.com/photo-1475855581690-80accde3a8a0?w=1200',
    'https://images.unsplash.com/photo-1464146072230-91cabc968266?w=1200',
    'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?w=1200',
    'https://images.unsplash.com/photo-1486304873000-235643847519?w=1200',
    'https://images.unsplash.com/photo-1497215842964-222b430dc094?w=1200',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200',
    'https://images.unsplash.com/photo-1507149833265-60c372daea22?w=1200',
    'https://images.unsplash.com/photo-1460317442991-0ec209397118?w=1200',
    'https://images.unsplash.com/photo-1491933382434-500287f9b54b?w=1200',
    'https://images.unsplash.com/photo-1479839672679-a46483c0e7c8?w=1200',
    'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?w=1200',
    'https://images.unsplash.com/photo-1501876725168-00c445821c9e?w=1200',
    'https://images.unsplash.com/photo-1487017159836-4e23ece2e4cf?w=1200',
    'https://images.unsplash.com/photo-1481277542470-605612bd2d61?w=1200',
    'https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=1200',
  ],
  KITCHEN: [
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200',
    'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=1200',
    'https://images.unsplash.com/photo-1493666438817-866a91353ca9?w=1200',
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200',
    'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=1200',
    'https://images.unsplash.com/photo-1501183638710-841dd1904471?w=1200',
    'https://images.unsplash.com/photo-1464890100898-a385f744067f?w=1200',
    'https://images.unsplash.com/photo-1494526585095-c41746248156?w=1200',
    'https://images.unsplash.com/photo-1472224371017-08207f84aaae?w=1200',
    'https://images.unsplash.com/photo-1475855581690-80accde3a8a0?w=1200',
    'https://images.unsplash.com/photo-1464146072230-91cabc968266?w=1200',
    'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?w=1200',
    'https://images.unsplash.com/photo-1486304873000-235643847519?w=1200',
    'https://images.unsplash.com/photo-1497215842964-222b430dc094?w=1200',
  ],
  BATHROOM: [
    'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=1200',
    'https://images.unsplash.com/photo-1501183638710-841dd1904471?w=1200',
    'https://images.unsplash.com/photo-1464890100898-a385f744067f?w=1200',
    'https://images.unsplash.com/photo-1494526585095-c41746248156?w=1200',
    'https://images.unsplash.com/photo-1472224371017-08207f84aaae?w=1200',
    'https://images.unsplash.com/photo-1475855581690-80accde3a8a0?w=1200',
    'https://images.unsplash.com/photo-1464146072230-91cabc968266?w=1200',
    'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?w=1200',
    'https://images.unsplash.com/photo-1486304873000-235643847519?w=1200',
    'https://images.unsplash.com/photo-1497215842964-222b430dc094?w=1200',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200',
    'https://images.unsplash.com/photo-1507149833265-60c372daea22?w=1200',
    'https://images.unsplash.com/photo-1460317442991-0ec209397118?w=1200',
    'https://images.unsplash.com/photo-1491933382434-500287f9b54b?w=1200',
    'https://images.unsplash.com/photo-1479839672679-a46483c0e7c8?w=1200',
  ],
  BALCONY: [
    'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?w=1200',
    'https://images.unsplash.com/photo-1501876725168-00c445821c9e?w=1200',
    'https://images.unsplash.com/photo-1487017159836-4e23ece2e4cf?w=1200',
    'https://images.unsplash.com/photo-1481277542470-605612bd2d61?w=1200',
    'https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=1200',
    'https://images.unsplash.com/photo-1523413651479-597eb2da0ad6?w=1200',
    'https://images.unsplash.com/photo-1522444195799-478538b28823?w=1200',
    'https://images.unsplash.com/photo-1495435229349-e86db7bfa013?w=1200',
    'https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=1200',
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200',
    'https://images.unsplash.com/photo-1475856034135-3188c9b130ec?w=1200',
    'https://images.unsplash.com/photo-1505409859467-3a796fd5798e?w=1200',
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200',
    'https://images.unsplash.com/photo-1493663284031-b7e3aaa4cab7?w=1200',
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200',
  ],
};

const ROOMS = ['EXTERIOR', 'LIVING', 'BEDROOM', 'KITCHEN', 'BATHROOM', 'BALCONY'] as const;

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — no external dependency
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  const rand = mulberry32(seed);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Shuffle the pool deterministically by propertyId, then pick by propertyIndex.
// Two properties at the same index but different IDs get different images.
// Two adjacent properties (i=0, i=1) pick from differently-shuffled pools.
function pickUrl(room: string, propertyId: number, propertyIndex: number): string {
  const pool = ROOM_POOLS[room];
  const shuffled = seededShuffle(pool, propertyId);
  return shuffled[propertyIndex % shuffled.length];
}

// ---------------------------------------------------------------------------
// DB connection from DATABASE_URL
// ---------------------------------------------------------------------------

function parseDbUrl(raw: string): mysql.ConnectionOptions {
  const u = new URL(raw);
  const opts: mysql.ConnectionOptions = {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
  if (u.searchParams.get('ssl-mode') === 'REQUIRED') {
    opts.ssl = { rejectUnauthorized: false };
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set in .env');

  const connection = await mysql.createConnection(parseDbUrl(dbUrl));

  try {
    const [rows] = await connection.query('SELECT id FROM `Property` ORDER BY createdAt DESC LIMIT 15');
    const properties = rows as { id: number }[];

    if (!properties.length) {
      console.log('No properties found.');
      return;
    }

    const selectedCount = properties.length;
    let deletedImages = 0;
    let insertedImages = 0;

    console.log(`Selected ${selectedCount} properties for demo image seeding.`);

    for (let i = 0; i < properties.length; i++) {
      const { id } = properties[i];

      // Pre-compute all 6 URLs for this property
      const images = ROOMS.map((room, sortOrder) => ({
        room,
        url: pickUrl(room, id, i),
        sortOrder: sortOrder + 1,
      }));

      const livingUrl = images.find((img) => img.room === 'LIVING')!.url;

      await connection.beginTransaction();
      try {
        const [deleteResult] = await connection.execute('DELETE FROM `PropertyImage` WHERE propertyId = ?', [id]);
        const deletedRows = (deleteResult as { affectedRows?: number }).affectedRows ?? 0;
        deletedImages += deletedRows;

        const values: (string | number)[] = [];
        const placeholders = images
          .map(({ url, room, sortOrder }) => {
            values.push(id, url, room, sortOrder);
            return '(?, ?, ?, NULL, ?, NOW(), NOW())';
          })
          .join(', ');

        const [insertResult] = await connection.execute(
          `INSERT INTO \`PropertyImage\` (propertyId, url, room, caption, sortOrder, createdAt, updatedAt) VALUES ${placeholders}`,
          values,
        );
        const insertedRows = (insertResult as { affectedRows?: number }).affectedRows ?? images.length;
        insertedImages += insertedRows;

        await connection.execute(
          'UPDATE `Property` SET image = ?, updatedAt = NOW() WHERE id = ?',
          [livingUrl, id],
        );

        await connection.commit();
      } catch (err) {
        await connection.rollback();
        throw err;
      }
    }

    console.log(`Properties selected: ${selectedCount}`);
    console.log(`PropertyImage rows deleted: ${deletedImages}`);
    console.log(`PropertyImage rows inserted: ${insertedImages}`);
    console.log('Done');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('seed:images failed:', err);
  process.exit(1);
});
