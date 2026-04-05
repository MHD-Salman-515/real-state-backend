import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PropertyImageRow = {
  url: string;
  room: string;
  caption: string | null;
  sortOrder: number;
};

@Injectable()
export class PropertyService {
  constructor(private prisma: PrismaService) {}

  private async getOwnedPropertyOrThrow(ownerId: number, propertyId: number) {
    const property = await this.prisma.property.findFirst({
      where: {
        id: propertyId,
        ownerId,
      },
      select: {
        id: true,
        ownerId: true,
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    return property;
  }

  private buildPublicPagination(page = 1, limit = 20) {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 20) : 20;

    return {
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    };
  }

  private buildAdminPagination(page = 1, limit = 50) {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;

    return {
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    };
  }

  private async ensureOpsLogTable() {
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

  private async logPropertyOperation(
    action: string,
    propertyId: number,
    actorUserId: number | null,
    meta: Record<string, unknown> = {},
  ) {
    await this.ensureOpsLogTable();
    await this.prisma.$executeRawUnsafe(
      'INSERT INTO `PropertyOpsLog` (actorUserId, action, propertyId, metaJson, createdAt) VALUES (?, ?, ?, ?, NOW())',
      actorUserId,
      action,
      propertyId,
      JSON.stringify(meta),
    );
  }

  async create(data: any, ownerId: number, imagePath?: string | null, actorUserId?: number | null) {
    const payload: any = { ...data, ownerId };

    if (data?.price !== undefined && data?.price !== null) {
      payload.price = Number(data.price);
    }

    if (data?.area !== undefined && data?.area !== null) {
      payload.area = Number(data.area);
    }

    if (imagePath) payload.image = imagePath;

    const created = await this.prisma.property.create({ data: payload });
    await this.logPropertyOperation('CREATE_PROPERTY', created.id, actorUserId ?? ownerId, { type: created.type });
    return created;
  }

  async findAll(page = 1, limit = 20) {
    return this.findPublic(page, limit);
  }

  async findPublic(page = 1, limit = 20) {
    const pagination = this.buildPublicPagination(page, limit);

    return this.prisma.property.findMany({
      include: { owner: true },
      orderBy: { createdAt: 'desc' },
      ...pagination,
    });
  }

  async findAllAdmin(page = 1, limit = 50) {
    const pagination = this.buildAdminPagination(page, limit);

    return this.prisma.property.findMany({
      include: { owner: true },
      orderBy: { createdAt: 'desc' },
      ...pagination,
    });
  }

  async findOne(id: number) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: { owner: true },
    });

    if (!property) throw new NotFoundException('Property not found');

    const images = await this.prisma.$queryRaw<PropertyImageRow[]>(Prisma.sql`
      SELECT url, room, caption, sortOrder
      FROM PropertyImage
      WHERE propertyId = ${id}
      ORDER BY sortOrder ASC, id ASC
    `);

    return {
      ...property,
      images,
    };
  }

  async update(id: number, data: any, imagePath?: string | null, actorUserId?: number | null) {
    const payload: any = { ...data };
    delete payload.ownerId;

    if (data?.price !== undefined && data?.price !== null) {
      payload.price = Number(data.price);
    }

    if (data?.area !== undefined && data?.area !== null) {
      payload.area = Number(data.area);
    }

    if (imagePath !== undefined) {
      payload.image = imagePath;
    }

    let updated;
    try {
      updated = await this.prisma.property.update({
        where: { id },
        data: payload,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Property not found');
      }
      throw error;
    }

    await this.logPropertyOperation('UPDATE_PROPERTY', updated.id, actorUserId ?? null, {
      fields: Object.keys(payload),
    });

    return updated;
  }

  async updateOwned(
    ownerId: number,
    id: number,
    data: any,
    imagePath?: string | null,
    actorUserId?: number | null,
  ) {
    await this.getOwnedPropertyOrThrow(ownerId, id);
    return this.update(id, data, imagePath, actorUserId);
  }

  async delete(id: number, actorUserId?: number | null) {
    let deleted;
    try {
      deleted = await this.prisma.property.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Property not found');
      }
      throw error;
    }

    await this.logPropertyOperation('DELETE_PROPERTY', id, actorUserId ?? null, {});
    return deleted;
  }

  async deleteOwned(ownerId: number, id: number, actorUserId?: number | null) {
    await this.getOwnedPropertyOrThrow(ownerId, id);
    return this.delete(id, actorUserId);
  }
}
