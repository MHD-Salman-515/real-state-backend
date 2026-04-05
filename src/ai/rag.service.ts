import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketContext, PropertyContext } from './ai.types';

@Injectable()
export class RagService {
  constructor(private readonly prisma: PrismaService) {}

  async getMarketContext(district: string): Promise<MarketContext | null> {
    const districtText = String(district || '').trim();
    if (!districtText) {
      return null;
    }

    const rows = await this.prisma.marketData.findMany({
      where: {
        district: districtText,
      },
      select: {
        price_per_m2_syp: true,
        price_per_m2: true,
        created_at: true,
      },
      orderBy: {
        created_at: 'desc',
      },
      take: 200,
    });

    if (rows.length === 0) {
      return null;
    }

    const priceValues = rows
      .map((row) => {
        const syp = Number(row.price_per_m2_syp);
        if (Number.isFinite(syp) && syp > 0) {
          return syp;
        }
        const fallback = Number(row.price_per_m2);
        if (Number.isFinite(fallback) && fallback > 0) {
          return fallback;
        }
        return null;
      })
      .filter((value): value is number => value != null);

    if (priceValues.length === 0) {
      return null;
    }

    const avgPriceM2 =
      priceValues.reduce((sum, value) => sum + value, 0) / priceValues.length;

    return {
      district: districtText,
      avg_price_m2: Number(avgPriceM2.toFixed(2)),
      last_update: rows[0].created_at.toISOString(),
    };
  }

  async getPropertyContext(propertyId: number): Promise<PropertyContext | null> {
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return null;
    }

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        area: true,
        price: true,
        address: true,
        type: true,
      },
    });

    if (!property) {
      return null;
    }

    return {
      property_id: property.id,
      area_m2: property.area == null ? null : Number(property.area),
      price: property.price == null ? null : Number(property.price),
      district: property.address ?? null,
      type: property.type ? String(property.type) : null,
    };
  }
}
