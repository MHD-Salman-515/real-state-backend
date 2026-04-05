import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';

type Room = 'LIVING' | 'KITCHEN' | 'BATHROOM' | 'BEDROOM' | 'EXTERIOR' | 'BALCONY';
type RoomFiles = Record<Room, string[]>;

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'housing_db',
};

const PUBLIC_DEMO_ROOT = process.env.DEMO_IMAGES_PUBLIC_ROOT
  ? resolve(process.cwd(), process.env.DEMO_IMAGES_PUBLIC_ROOT)
  : resolve(process.cwd(), '../../my-real-state-front-end/my-real-state/public/demo-images');

const ROOM_TO_DIR: Record<Room, string> = {
  LIVING: 'living',
  KITCHEN: 'kitchen',
  BATHROOM: 'bathroom',
  BEDROOM: 'bedroom',
  EXTERIOR: 'exterior',
  BALCONY: 'balcony',
};

const CAPTION_BASE: Record<Room, string> = {
  LIVING: 'غرفة معيشة',
  KITCHEN: 'مطبخ',
  BATHROOM: 'حمام',
  BEDROOM: 'غرفة نوم',
  EXTERIOR: 'واجهة خارجية',
  BALCONY: 'شرفة',
};

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chance(probability: number): boolean {
  return Math.random() < probability;
}

async function ensurePropertyImageTable(connection: mysql.Connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`PropertyImage\` (
      \`id\` BIGINT AUTO_INCREMENT PRIMARY KEY,
      \`propertyId\` INT NOT NULL,
      \`url\` TEXT NOT NULL,
      \`room\` ENUM('LIVING','KITCHEN','BEDROOM','BATHROOM','BALCONY','EXTERIOR') NOT NULL,
      \`caption\` VARCHAR(255) NULL,
      \`sortOrder\` INT NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_property_image_property_id\` (\`propertyId\`),
      CONSTRAINT \`fk_property_image_property_id\`
        FOREIGN KEY (\`propertyId\`) REFERENCES \`Property\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

async function loadLocalRoomFiles(): Promise<RoomFiles> {
  const roomFiles = {} as RoomFiles;

  for (const [room, dirName] of Object.entries(ROOM_TO_DIR) as Array<[Room, string]>) {
    const dirPath = resolve(PUBLIC_DEMO_ROOT, dirName);
    const files = (await readdir(dirPath))
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort((a, b) => a.localeCompare(b));

    if (!files.length) {
      throw new Error(`No local demo images found for ${room} at ${dirPath}`);
    }

    roomFiles[room] = files.map((f) => `/demo-images/${dirName}/${f}`);
  }

  return roomFiles;
}

function pickUnique(room: Room, pool: RoomFiles, used: Set<string>): string {
  const items = pool[room];
  const max = items.length * 2;

  for (let i = 0; i < max; i += 1) {
    const candidate = items[randInt(0, items.length - 1)];
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }

  const fallback = `${items[0]}?v=${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

async function main() {
  const roomFiles = await loadLocalRoomFiles();

  const connection = await mysql.createConnection(DB_CONFIG);
  try {
    await ensurePropertyImageTable(connection);

    const [rows] = await connection.query('SELECT id FROM `Property`');
    const properties = rows as Array<{ id: number }>;

    if (!properties.length) {
      console.log('No properties found.');
      return;
    }

    await connection.beginTransaction();
    try {
      await connection.query('DELETE FROM `PropertyImage`');

      let totalImages = 0;

      for (let i = 0; i < properties.length; i += 1) {
        const propertyId = properties[i].id;
        const bedrooms = Math.max(1, randInt(1, 4));
        const bathrooms = randInt(1, 3);

        const used = new Set<string>();
        const images: Array<{ room: Room; url: string; caption: string; sortOrder: number }> = [];

        const add = (room: Room, caption: string) => {
          images.push({
            room,
            url: pickUnique(room, roomFiles, used),
            caption,
            sortOrder: images.length + 1,
          });
        };

        add('LIVING', CAPTION_BASE.LIVING);
        add('LIVING', `${CAPTION_BASE.LIVING} 2`);

        add('KITCHEN', CAPTION_BASE.KITCHEN);

        for (let b = 1; b <= bathrooms; b += 1) {
          add('BATHROOM', bathrooms > 1 ? `${CAPTION_BASE.BATHROOM} ${b}` : CAPTION_BASE.BATHROOM);
        }

        for (let b = 1; b <= bedrooms; b += 1) {
          add('BEDROOM', `${CAPTION_BASE.BEDROOM} ${b}`);
        }

        if (chance(0.4)) add('EXTERIOR', CAPTION_BASE.EXTERIOR);
        if (chance(0.3)) add('BALCONY', CAPTION_BASE.BALCONY);

        const values: Array<number | string> = [];
        const placeholders = images
          .map((img) => {
            values.push(propertyId, img.url, img.room, img.caption, img.sortOrder);
            return '(?, ?, ?, ?, ?, NOW(), NOW())';
          })
          .join(', ');

        await connection.execute(
          `INSERT INTO \`PropertyImage\` (propertyId, url, room, caption, sortOrder, createdAt, updatedAt) VALUES ${placeholders}`,
          values,
        );

        totalImages += images.length;

        const thumb = images.find((x) => x.room === 'LIVING')?.url || images[0].url;
        await connection.execute('UPDATE `Property` SET image = ?, updatedAt = NOW() WHERE id = ?', [thumb, propertyId]);

        if ((i + 1) % 200 === 0) {
          console.log(`Processed ${i + 1}/${properties.length}`);
        }
      }

      await connection.commit();
      console.log(`Done. Updated ${properties.length} properties, inserted ${totalImages} room images.`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('props:images:regen failed', error);
  process.exit(1);
});
