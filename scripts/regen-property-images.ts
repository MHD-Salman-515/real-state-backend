import mysql from 'mysql2/promise';
import { BLOCKED_IMAGE_KEYWORDS, ROOM_IMAGE_POOLS, RoomType } from './room-image-pools';

type PropertyRow = { id: number; type: string | null };

type PlannedImage = {
  room: RoomType;
  url: string;
  caption: string;
  sortOrder: number;
};

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'housing_db',
};

const CAPTION_AR: Record<RoomType, string> = {
  LIVING: 'غرفة معيشة',
  KITCHEN: 'مطبخ',
  BATHROOM: 'حمام',
  BEDROOM: 'غرفة نوم',
  EXTERIOR: 'واجهة العقار',
  BALCONY: 'بلكون',
  DINING: 'سفرة',
};

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chance(probability: number): boolean {
  return Math.random() < probability;
}

function containsBlockedKeyword(url: string): boolean {
  const lowered = url.toLowerCase();
  return BLOCKED_IMAGE_KEYWORDS.some((word) => lowered.includes(word));
}

function pickUniqueRoomImage(room: RoomType, used: Set<string>): string {
  const pool = ROOM_IMAGE_POOLS[room];
  const maxAttempts = pool.length * 2;

  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = pool[randInt(0, pool.length - 1)];
    if (containsBlockedKeyword(candidate)) continue;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  for (const candidate of pool) {
    if (containsBlockedKeyword(candidate)) continue;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  const fallback = `${pool[0]}&v=${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

function resolveBedsAndBaths(propertyType: string | null) {
  const type = String(propertyType || '').toUpperCase();
  if (type === 'VILLA') return { bedrooms: randInt(3, 6), bathrooms: randInt(2, 4) };
  if (type === 'HOUSE') return { bedrooms: randInt(2, 5), bathrooms: randInt(1, 3) };
  return { bedrooms: randInt(1, 4), bathrooms: randInt(1, 2) };
}

function buildPlan(type: string | null): PlannedImage[] {
  const { bedrooms, bathrooms } = resolveBedsAndBaths(type);
  const usedUrls = new Set<string>();
  const items: PlannedImage[] = [];

  const add = (room: RoomType, caption: string) => {
    items.push({
      room,
      url: pickUniqueRoomImage(room, usedUrls),
      caption,
      sortOrder: items.length + 1,
    });
  };

  add('LIVING', CAPTION_AR.LIVING);
  add('LIVING', `${CAPTION_AR.LIVING} 2`);
  add('KITCHEN', CAPTION_AR.KITCHEN);

  for (let i = 1; i <= bathrooms; i += 1) {
    add('BATHROOM', bathrooms > 1 ? `${CAPTION_AR.BATHROOM} ${i}` : CAPTION_AR.BATHROOM);
  }

  for (let i = 1; i <= Math.min(bedrooms, 4); i += 1) {
    add('BEDROOM', `${CAPTION_AR.BEDROOM} ${i}`);
  }

  if (chance(0.4)) add('EXTERIOR', CAPTION_AR.EXTERIOR);
  if (chance(0.3)) add('BALCONY', CAPTION_AR.BALCONY);
  if (chance(0.2)) add('DINING', CAPTION_AR.DINING);

  return items;
}

async function ensurePropertyImageTable(connection: mysql.Connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`PropertyImage\` (
      \`id\` BIGINT AUTO_INCREMENT PRIMARY KEY,
      \`propertyId\` BIGINT NOT NULL,
      \`url\` TEXT NOT NULL,
      \`room\` ENUM('LIVING','KITCHEN','BATHROOM','BEDROOM','EXTERIOR','BALCONY','DINING') NOT NULL,
      \`caption\` VARCHAR(255) NULL,
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_property_image_property_id\` (\`propertyId\`),
      CONSTRAINT \`fk_property_image_property_id\`
        FOREIGN KEY (\`propertyId\`) REFERENCES \`Property\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connection.query(`
    ALTER TABLE \`PropertyImage\`
    MODIFY COLUMN \`room\` ENUM('LIVING','KITCHEN','BATHROOM','BEDROOM','EXTERIOR','BALCONY','DINING') NOT NULL
  `);
}

async function logOperation(
  connection: mysql.Connection,
  action: string,
  propertyId: number,
  actorUserId: number | null,
  meta: Record<string, unknown>,
) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`PropertyOpsLog\` (
      \`id\` BIGINT AUTO_INCREMENT PRIMARY KEY,
      \`actorUserId\` INT NULL,
      \`action\` VARCHAR(80) NOT NULL,
      \`propertyId\` BIGINT NULL,
      \`metaJson\` JSON NULL,
      \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_property_ops_created_at\` (\`createdAt\`),
      INDEX \`idx_property_ops_property_id\` (\`propertyId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await connection.execute(
    'INSERT INTO `PropertyOpsLog` (actorUserId, action, propertyId, metaJson, createdAt) VALUES (?, ?, ?, ?, NOW())',
    [actorUserId, action, propertyId, JSON.stringify(meta)],
  );
}

async function main() {
  const connection = await mysql.createConnection(DB_CONFIG);
  try {
    await ensurePropertyImageTable(connection);

    const [rows] = await connection.query('SELECT id, type FROM `Property`');
    const properties = rows as PropertyRow[];

    if (!properties.length) {
      console.log('No properties found.');
      return;
    }

    let insertedImages = 0;

    for (let i = 0; i < properties.length; i += 1) {
      const property = properties[i];
      const plan = buildPlan(property.type);

      await connection.beginTransaction();
      try {
        await connection.execute('DELETE FROM `PropertyImage` WHERE propertyId = ?', [property.id]);

        if (plan.length) {
          const values: Array<string | number> = [];
          const placeholders = plan
            .map((img) => {
              values.push(property.id, img.url, img.room, img.caption, img.sortOrder);
              return '(?, ?, ?, ?, ?, NOW(), NOW())';
            })
            .join(', ');

          await connection.execute(
            `INSERT INTO \`PropertyImage\` (propertyId, url, room, caption, sortOrder, createdAt, updatedAt) VALUES ${placeholders}`,
            values,
          );

          const firstLiving = plan.find((x) => x.room === 'LIVING')?.url || plan[0].url;
          await connection.execute('UPDATE `Property` SET image = ?, updatedAt = NOW() WHERE id = ?', [firstLiving, property.id]);

          insertedImages += plan.length;

          await logOperation(connection, 'REGEN_IMAGES', property.id, null, {
            imagesCount: plan.length,
            hasExterior: plan.some((x) => x.room === 'EXTERIOR'),
            hasBalcony: plan.some((x) => x.room === 'BALCONY'),
            hasDining: plan.some((x) => x.room === 'DINING'),
          });
        }

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }

      if ((i + 1) % 200 === 0) {
        console.log(`Processed ${i + 1}/${properties.length}`);
      }
    }

    console.log(`Done. Properties: ${properties.length}, inserted PropertyImage rows: ${insertedImages}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('props:images:regen failed', error);
  process.exit(1);
});
