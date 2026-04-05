import { BadRequestException, Injectable } from '@nestjs/common';
import { AdvisorService } from '../advisor/advisor.service';
import { PrismaService } from '../prisma/prisma.service';

type PropertyTypeKey = 'apartment' | 'house' | 'villa' | 'studio' | 'land';

interface PortfolioProperty {
  id: number;
  title: string;
  city: string;
  address: string | null;
  type: string;
  area: number | null;
  price: number | null;
  updatedAt: Date;
  createdAt: Date;
}

interface PriorityBlock {
  score: number;
  label: 'sell_now' | 'watch' | 'ok';
  reasons: string[];
}

@Injectable()
export class OwnerPortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly advisorService: AdvisorService,
  ) {}

  async getPortfolio(params: {
    ownerId: number;
    daysWindow: number;
    limit: number;
  }) {
    if (!Number.isInteger(params.ownerId) || params.ownerId <= 0) {
      throw new BadRequestException('Invalid owner id');
    }

    const properties = await this.prisma.property.findMany({
      where: { ownerId: params.ownerId },
      orderBy: { updatedAt: 'desc' },
      take: params.limit,
      select: {
        id: true,
        title: true,
        city: true,
        address: true,
        type: true,
        area: true,
        price: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    const items = await Promise.all(
      properties.map(async (property) => ({
        property: this.serializeProperty(property),
        ai: await this.buildAiBlock(property, params.daysWindow),
      })),
    );

    return {
      days_window: params.daysWindow,
      items,
    };
  }

  private async buildAiBlock(property: PortfolioProperty, daysWindow: number) {
    const mappedType = this.mapPropertyType(property.type);
    const city = String(property.city || '').trim();
    const district = String(property.address || '').trim();
    const areaM2 = Number(property.area);
    const proposedPriceSyp = Number(property.price);

    const missing: string[] = [];
    if (!city) missing.push('city');
    if (!district) missing.push('address');
    if (!mappedType) missing.push('type');
    if (!Number.isFinite(areaM2) || areaM2 <= 0) missing.push('area');
    if (!Number.isFinite(proposedPriceSyp) || proposedPriceSyp <= 0) missing.push('price');

    if (missing.length > 0) {
      return {
        status: 'missing_fields',
        missing,
      };
    }

    const [seller, insights, simulation] = await Promise.all([
      this.advisorService.getSellerPriceSuggestion({
        city,
        district,
        property_type: mappedType as PropertyTypeKey,
        area_m2: areaM2,
      }),
      this.advisorService.getInsights({
        city,
        district,
        property_type: mappedType as PropertyTypeKey,
        days_window: daysWindow,
        suggested_price_syp: proposedPriceSyp,
        area_m2: areaM2,
      }),
      this.advisorService.simulate({
        city,
        district,
        property_type: mappedType as PropertyTypeKey,
        area_m2: areaM2,
        proposed_price_syp: proposedPriceSyp,
        days_window: daysWindow,
      }),
    ]);

    const priority = this.computePriority({
      confidence: Number(seller.confidence || 0),
      volatility: Number(insights.stats?.volatility_index || 0),
      trendDirection: insights.stats?.trend_last_30_days?.direction || 'flat',
      deviationPercent: Number(simulation.deviation_percent || 0),
    });

    return {
      seller,
      insights,
      simulation,
      priority,
    };
  }

  private computePriority(params: {
    confidence: number;
    volatility: number;
    trendDirection: 'up' | 'down' | 'flat';
    deviationPercent: number;
  }): PriorityBlock {
    const trendPenalty =
      params.trendDirection === 'up' ? 0.2 : params.trendDirection === 'flat' ? 0.1 : 0;

    const score = this.clamp01(
      (1 - this.clamp01(params.confidence)) * 0.35 +
        this.clamp01(params.volatility) * 0.25 +
        trendPenalty * 0.15 +
        this.clamp01(Math.abs(params.deviationPercent) / 25) * 0.25,
    );

    const label: PriorityBlock['label'] =
      score >= 0.7 ? 'sell_now' : score >= 0.4 ? 'watch' : 'ok';

    const reasons: string[] = [];
    if (params.confidence < 0.5) {
      reasons.push('ثقة قليلة بسبب قلة العينات/حداثة البيانات');
    }
    if (params.volatility > 0.2) {
      reasons.push('تذبذب عالي بالسوق');
    }
    if (Math.abs(params.deviationPercent) > 8) {
      reasons.push('سعرك بعيد عن وسيط السوق');
    }
    if (params.trendDirection === 'up') {
      reasons.push('الاتجاه خلال آخر شهر صاعد');
    } else if (params.trendDirection === 'down') {
      reasons.push('الاتجاه خلال آخر شهر هابط');
    }

    return { score, label, reasons };
  }

  private serializeProperty(property: PortfolioProperty) {
    return {
      id: property.id,
      title: property.title,
      city: property.city,
      address: property.address,
      type: property.type,
      area: property.area,
      price: property.price,
      updated_at: property.updatedAt.toISOString(),
      created_at: property.createdAt.toISOString(),
    };
  }

  private mapPropertyType(value?: string | null): PropertyTypeKey | null {
    const key = String(value || '').toUpperCase();
    if (key === 'APARTMENT') return 'apartment';
    if (key === 'HOUSE') return 'house';
    if (key === 'VILLA') return 'villa';
    if (key === 'STUDIO') return 'studio';
    if (key === 'LAND') return 'land';
    return null;
  }

  private clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }
}
