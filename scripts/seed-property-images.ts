import * as dotenv from 'dotenv';
import * as path from 'path';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ---------------------------------------------------------------------------
// URL pools – 20 curated Unsplash photos per room type
// ---------------------------------------------------------------------------

const ROOM_POOLS: Record<string, string[]> = {
  LIVING: [
    'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200',
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200',
    'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=1200',
    'https://images.unsplash.com/photo-1567016376408-0226e4d0c1ea?w=1200',
    'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=1200',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200',
    'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=1200',
    'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200',
    'https://images.unsplash.com/photo-1538944495092-b6a4af8f8e06?w=1200',
    'https://images.unsplash.com/photo-1541123437800-1bb1317badc2?w=1200',
    'https://images.unsplash.com/photo-1543489822-c49534f3271f?w=1200',
    'https://images.unsplash.com/photo-1560440021-33f9b867899d?w=1200',
    'https://images.unsplash.com/photo-1565183997392-2f6f122e5912?w=1200',
    'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200',
    'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=1200',
    'https://images.unsplash.com/photo-1574180566232-aaad1b5b8450?w=1200',
    'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=1200',
    'https://images.unsplash.com/photo-1588854337236-6889d631faa8?w=1200',
    'https://images.unsplash.com/photo-1600210492493-0946911123ea?w=1200',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200',
  ],
  KITCHEN: [
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200',
    'https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=1200',
    'https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=1200',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200',
    'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=1200',
    'https://images.unsplash.com/photo-1600489000022-c2086d79f9d4?w=1200',
    'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=1200',
    'https://images.unsplash.com/photo-1606744824163-985d376605ef?w=1200',
    'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=1200',
    'https://images.unsplash.com/photo-1610048682346-1c030efb5571?w=1200',
    'https://images.unsplash.com/photo-1614649024145-7f847b002883?w=1200',
    'https://images.unsplash.com/photo-1615529328331-f8917597711f?w=1200',
    'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=1200',
    'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=1200',
    'https://images.unsplash.com/photo-1556912167-f556f1f39fdf?w=1200',
    'https://images.unsplash.com/photo-1543418219-44e30b057fea?w=1200',
    'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=1200',
    'https://images.unsplash.com/photo-1574503341543-5b4b72e3af3c?w=1200',
    'https://images.unsplash.com/photo-1588854337115-1c67d9247e4d?w=1200',
    'https://images.unsplash.com/photo-1565183997392-2f6f122e5912?w=1200',
  ],
  BEDROOM: [
    'https://images.unsplash.com/photo-1505693314120-0d443867891c?w=1200',
    'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=1200',
    'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=1200',
    'https://images.unsplash.com/photo-1556020685-ae41abfc9365?w=1200',
    'https://images.unsplash.com/photo-1560185008-b033106af5c3?w=1200',
    'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=1200',
    'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=1200',
    'https://images.unsplash.com/photo-1574088068604-4d85df30b334?w=1200',
    'https://images.unsplash.com/photo-1585038231466-e9e55c57f3a1?w=1200',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200',
    'https://images.unsplash.com/photo-1588046130717-0eb0c9a3ba15?w=1200',
    'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1200',
    'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=1200',
    'https://images.unsplash.com/photo-1600210491369-e753d80a41f3?w=1200',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200',
    'https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?w=1200',
    'https://images.unsplash.com/photo-1603052875302-d376b7c0638a?w=1200',
    'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1200',
    'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=1200',
    'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200',
  ],
  BATHROOM: [
    'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1200',
    'https://images.unsplash.com/photo-1564540574859-0dfb63985953?w=1200',
    'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=1200',
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=1200',
    'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=1200',
    'https://images.unsplash.com/photo-1600566752447-f4e1971fd6a2?w=1200',
    'https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=1200',
    'https://images.unsplash.com/photo-1603193308721-83b4e01e7b82?w=1200',
    'https://images.unsplash.com/photo-1604709177225-055f99402ea3?w=1200',
    'https://images.unsplash.com/photo-1605300319268-edd88df7a82e?w=1200',
    'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=1200',
    'https://images.unsplash.com/photo-1609766418204-94aae0ecfdfc?w=1200',
    'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1200',
    'https://images.unsplash.com/photo-1613545325278-f24b0cae1224?w=1200',
    'https://images.unsplash.com/photo-1615874694520-474822394e73?w=1200',
    'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1200',
    'https://images.unsplash.com/photo-1619411281075-b5d5f7059fce?w=1200',
    'https://images.unsplash.com/photo-1620626011761-996317702431?w=1200',
    'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=1200',
    'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1200',
  ],
  EXTERIOR: [
    'https://images.unsplash.com/photo-1480074568708-e7b720bb3f09?w=1200',
    'https://images.unsplash.com/photo-1449844908441-8829872d2607?w=1200',
    'https://images.unsplash.com/photo-1455587734955-081b22074882?w=1200',
    'https://images.unsplash.com/photo-1464146072230-91cabc968266?w=1200',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200',
    'https://images.unsplash.com/photo-1502005097973-6a7082348e28?w=1200',
    'https://images.unsplash.com/photo-1510627489930-0c1b0bfb6785?w=1200',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200',
    'https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=1200',
    'https://images.unsplash.com/photo-1526769765522-37f5d8a1c37e?w=1200',
    'https://images.unsplash.com/photo-1531971589569-0d9370cbe1e5?w=1200',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200',
    'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200',
    'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=1200',
    'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=1200',
    'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=1200',
    'https://images.unsplash.com/photo-1592595896551-12b371d546d5?w=1200',
    'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200',
  ],
  BALCONY: [
    'https://images.unsplash.com/photo-1516455590571-18256e5bb9ff?w=1200',
    'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=1200',
    'https://images.unsplash.com/photo-1549517045-bc93de28048e?w=1200',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200',
    'https://images.unsplash.com/photo-1560185008-b033106af5c3?w=1200',
    'https://images.unsplash.com/photo-1564540574859-0dfb63985953?w=1200',
    'https://images.unsplash.com/photo-1574180566232-aaad1b5b8450?w=1200',
    'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=1200',
    'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=1200',
    'https://images.unsplash.com/photo-1591088398332-8a7791972843?w=1200',
    'https://images.unsplash.com/photo-1595514535116-c68c89d0b2e0?w=1200',
    'https://images.unsplash.com/photo-1598928636135-d146006ff4be?w=1200',
    'https://images.unsplash.com/photo-1600210492493-0946911123ea?w=1200',
    'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=1200',
    'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200',
    'https://images.unsplash.com/photo-1601084881623-cdf9a8ea242c?w=1200',
    'https://images.unsplash.com/photo-1605276373954-0c4a0dac5b12?w=1200',
    'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=1200',
    'https://images.unsplash.com/photo-1615529328331-f8917597711f?w=1200',
    'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200',
  ],
};

const ROOMS = ['LIVING', 'KITCHEN', 'BEDROOM', 'BATHROOM', 'EXTERIOR', 'BALCONY'] as const;

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
    opts.ssl = {};
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
    const [rows] = await connection.query('SELECT id FROM `Property` ORDER BY id ASC');
    const properties = rows as { id: number }[];

    if (!properties.length) {
      console.log('No properties found.');
      return;
    }

    console.log(`Found ${properties.length} properties. Seeding images...`);
    let inserted = 0;

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
        await connection.execute('DELETE FROM `PropertyImage` WHERE propertyId = ?', [id]);

        const values: (string | number)[] = [];
        const placeholders = images
          .map(({ url, room, sortOrder }) => {
            values.push(id, url, room, sortOrder);
            return '(?, ?, ?, NULL, ?, NOW(), NOW())';
          })
          .join(', ');

        await connection.execute(
          `INSERT INTO \`PropertyImage\` (propertyId, url, room, caption, sortOrder, createdAt, updatedAt) VALUES ${placeholders}`,
          values,
        );

        await connection.execute(
          'UPDATE `Property` SET image = ?, updatedAt = NOW() WHERE id = ?',
          [livingUrl, id],
        );

        inserted += images.length;
        await connection.commit();
      } catch (err) {
        await connection.rollback();
        throw err;
      }

      if ((i + 1) % 100 === 0 || i + 1 === properties.length) {
        console.log(`  ${i + 1}/${properties.length} properties processed`);
      }
    }

    console.log(`Done. Seeded ${inserted} PropertyImage rows across ${properties.length} properties.`);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('seed:images failed:', err);
  process.exit(1);
});
