import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type RoomType =
  | 'LIVING'
  | 'KITCHEN'
  | 'BATHROOM'
  | 'BEDROOM'
  | 'EXTERIOR'
  | 'BALCONY'
  | 'DINING';

@Injectable()
export class OpsService {
  constructor(private prisma: PrismaService) {}

  private buildPool(query: string, count = 120) {
    return Array.from({ length: count }, (_, i) => `https://source.unsplash.com/1600x1000/?${query}&sig=${i + 1}`);
  }

  private roomPools: Record<RoomType, string[]> = {
    LIVING: this.buildPool('empty,living-room,interior,modern'),
    KITCHEN: this.buildPool('empty,kitchen,interior,modern'),
    BATHROOM: this.buildPool('empty,bathroom,interior,modern'),
    BEDROOM: this.buildPool('empty,bedroom,interior,modern'),
    EXTERIOR: this.buildPool('building,exterior,architecture'),
    BALCONY: this.buildPool('balcony,view,architecture'),
    DINING: this.buildPool('empty,dining-room,interior,modern'),
  };

  private blockedKeywords = ['portrait', 'people', 'woman', 'man', 'model'];

  private captions: Record<RoomType, string> = {
    LIVING: 'غرفة معيشة',
    KITCHEN: 'مطبخ',
    BATHROOM: 'حمام',
    BEDROOM: 'غرفة نوم',
    EXTERIOR: 'واجهة العقار',
    BALCONY: 'بلكون',
    DINING: 'سفرة',
  };

  private randInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private chance(probability: number) {
    return Math.random() < probability;
  }

  private hasBlockedKeyword(url: string) {
    const lowered = url.toLowerCase();
    return this.blockedKeywords.some((word) => lowered.includes(word));
  }

  private pickUnique(room: RoomType, used: Set<string>) {
    const pool = this.roomPools[room];
    for (let i = 0; i < pool.length * 2; i += 1) {
      const candidate = pool[this.randInt(0, pool.length - 1)];
      if (this.hasBlockedKeyword(candidate)) continue;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }

    const fallback = `${pool[0]}&v=${used.size + 1}`;
    used.add(fallback);
    return fallback;
  }

  private resolveBedsBaths(type: string | null) {
    const t = String(type || '').toUpperCase();
    if (t === 'VILLA') return { bedrooms: this.randInt(3, 6), bathrooms: this.randInt(2, 4) };
    if (t === 'HOUSE') return { bedrooms: this.randInt(2, 5), bathrooms: this.randInt(1, 3) };
    return { bedrooms: this.randInt(1, 4), bathrooms: this.randInt(1, 2) };
  }

  private buildPlan(type: string | null) {
    const { bedrooms, bathrooms } = this.resolveBedsBaths(type);
    const used = new Set<string>();
    const rows: Array<{ room: RoomType; url: string; caption: string; sortOrder: number }> = [];

    const add = (room: RoomType, caption: string) => {
      rows.push({ room, caption, url: this.pickUnique(room, used), sortOrder: rows.length + 1 });
    };

    add('LIVING', this.captions.LIVING);
    add('LIVING', `${this.captions.LIVING} 2`);
    add('KITCHEN', this.captions.KITCHEN);

    for (let i = 1; i <= bathrooms; i += 1) {
      add('BATHROOM', bathrooms > 1 ? `${this.captions.BATHROOM} ${i}` : this.captions.BATHROOM);
    }

    for (let i = 1; i <= Math.min(bedrooms, 4); i += 1) {
      add('BEDROOM', `${this.captions.BEDROOM} ${i}`);
    }

    if (this.chance(0.4)) add('EXTERIOR', this.captions.EXTERIOR);
    if (this.chance(0.3)) add('BALCONY', this.captions.BALCONY);
    if (this.chance(0.2)) add('DINING', this.captions.DINING);

    return rows;
  }

  async ensureTables() {
    await this.prisma.$executeRawUnsafe(`
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

    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE \`PropertyImage\`
      MODIFY COLUMN \`room\` ENUM('LIVING','KITCHEN','BATHROOM','BEDROOM','EXTERIOR','BALCONY','DINING') NOT NULL
    `);


    await this.prisma.$executeRawUnsafe(`
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
  }

  async listQueue() {
    await this.ensureTables();
    return this.prisma.$queryRawUnsafe(`
      SELECT
        l.id,
        l.action,
        l.propertyId,
        l.actorUserId,
        l.metaJson,
        l.createdAt,
        u.fullName AS actorName
      FROM PropertyOpsLog l
      LEFT JOIN User u ON u.id = l.actorUserId
      ORDER BY l.createdAt DESC
      LIMIT 200
    `);
  }

  async regenImagesForProperty(propertyId: number, actorUserId: number | null) {
    await this.ensureTables();

    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundException('Property not found');

    const plan = this.buildPlan(property.type);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('DELETE FROM `PropertyImage` WHERE propertyId = ?', propertyId);

      if (plan.length) {
        const values = plan
          .map(() => '(?, ?, ?, ?, ?, NOW(), NOW())')
          .join(', ');
        const params: Array<number | string> = [];

        for (const img of plan) {
          params.push(propertyId, img.url, img.room, img.caption, img.sortOrder);
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO \`PropertyImage\` (propertyId, url, room, caption, sortOrder, createdAt, updatedAt) VALUES ${values}`,
          ...params,
        );

        const thumb = plan.find((x) => x.room === 'LIVING')?.url || plan[0].url;
        await tx.property.update({
          where: { id: propertyId },
          data: { image: thumb },
        });
      }

      await tx.$executeRawUnsafe(
        'INSERT INTO `PropertyOpsLog` (actorUserId, action, propertyId, metaJson, createdAt) VALUES (?, ?, ?, ?, NOW())',
        actorUserId,
        'REGEN_IMAGES_SINGLE',
        propertyId,
        JSON.stringify({ count: plan.length, type: property.type }),
      );
    });

    return {
      ok: true,
      propertyId,
      imagesCount: plan.length,
    };
  }
}
