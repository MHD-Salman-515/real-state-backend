import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdvisorService } from '../advisor/advisor.service';
import { normalizeAreaInput } from '../advisor/utils/area-normalization';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OwnerMarketWatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly advisorService: AdvisorService,
  ) {}

  async getInsights(params: {
    city: string;
    district?: string;
    property_type?: string;
    days_window: number;
  }) {
    if (!params.city?.trim()) {
      throw new BadRequestException('city is required');
    }

    return this.advisorService.getInsights({
      city: params.city,
      district: params.district,
      property_type: params.property_type,
      days_window: params.days_window,
    });
  }

  async list(ownerId: number) {
    const delegate = (this.prisma as any).ownerMarketWatch;
    const rows = await delegate.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        city: true,
        district: true,
        propertyType: true,
        daysWindow: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        city: row.city,
        district: row.district,
        property_type: row.propertyType,
        days_window: row.daysWindow,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
      })),
    };
  }

  async create(params: {
    ownerId: number;
    city: string;
    district: string;
    property_type: string;
    days_window: number;
  }) {
    const normalized = normalizeAreaInput({
      city: params.city,
      district: params.district,
      property_type: params.property_type,
    });

    if (
      !normalized.city_norm ||
      !normalized.district_norm ||
      !normalized.property_type_norm
    ) {
      throw new BadRequestException('city/district/property_type are required');
    }

    const delegate = (this.prisma as any).ownerMarketWatch;
    const created = await delegate.upsert({
      where: {
        ownerId_city_district_propertyType: {
          ownerId: params.ownerId,
          city: normalized.city_norm,
          district: normalized.district_norm,
          propertyType: normalized.property_type_norm,
        },
      },
      create: {
        ownerId: params.ownerId,
        city: normalized.city_norm,
        district: normalized.district_norm,
        propertyType: normalized.property_type_norm,
        daysWindow: params.days_window,
      },
      update: {
        daysWindow: params.days_window,
      },
      select: {
        id: true,
        city: true,
        district: true,
        propertyType: true,
        daysWindow: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      id: created.id,
      city: created.city,
      district: created.district,
      property_type: created.propertyType,
      days_window: created.daysWindow,
      created_at: created.createdAt.toISOString(),
      updated_at: created.updatedAt.toISOString(),
    };
  }

  async remove(params: { ownerId: number; id: number }) {
    const delegate = (this.prisma as any).ownerMarketWatch;
    const deleted = await delegate.deleteMany({
      where: {
        id: params.id,
        ownerId: params.ownerId,
      },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('Watch item not found');
    }

    return { success: true };
  }
}
