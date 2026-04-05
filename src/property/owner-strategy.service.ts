import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdvisorService } from '../advisor/advisor.service';
import { AdvisorRequestLogService } from '../advisor/advisor-request-log.service';
import { normalizeAreaInput, normalizeAreaValue } from '../advisor/utils/area-normalization';
import { PrismaService } from '../prisma/prisma.service';

type Severity = 'low' | 'medium' | 'high';

@Injectable()
export class OwnerStrategyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly advisorService: AdvisorService,
    private readonly advisorRequestLogService: AdvisorRequestLogService,
  ) {}

  async getStrategy(params: {
    propertyId: number;
    requester: { sub?: number; role?: string };
    daysWindow: number;
  }) {
    const property = await this.prisma.property.findUnique({
      where: { id: params.propertyId },
      select: {
        id: true,
        ownerId: true,
        city: true,
        address: true,
        type: true,
        area: true,
        price: true,
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const requesterRole = String(params.requester.role || '').toUpperCase();
    const requesterId = Number(params.requester.sub || 0);
    if (requesterRole === 'OWNER' && requesterId !== Number(property.ownerId)) {
      throw new ForbiddenException('You can only view strategy for your own properties');
    }

    const areaM2 = Number(property.area);
    const priceSyp = Number(property.price);
    if (!Number.isFinite(areaM2) || areaM2 <= 0) {
      throw new BadRequestException('area must be greater than 0');
    }
    if (!Number.isFinite(priceSyp) || priceSyp <= 0) {
      throw new BadRequestException('لازم تحط سعر للعقار أولاً');
    }

    const cityRaw = String(property.city || '').trim();
    if (!cityRaw) {
      throw new BadRequestException('city missing on property');
    }

    const districtRaw = String(property.address || '').trim();
    if (!districtRaw) {
      throw new BadRequestException('address (district) missing on property');
    }

    const typeRaw = String(property.type || '').toUpperCase();
    if (!typeRaw) {
      throw new BadRequestException('type missing on property');
    }
    const propertyType = this.mapPropertyType(typeRaw);
    if (!propertyType) {
      throw new BadRequestException('type missing on property');
    }

    const districtNormalized = normalizeAreaValue('district', districtRaw) ?? districtRaw;

    const normalized = normalizeAreaInput({
      city: cityRaw,
      district: districtNormalized,
      property_type: propertyType,
    });

    if (!normalized.city_norm || !normalized.district_norm || !normalized.property_type_norm) {
      throw new BadRequestException('Unable to normalize property city/district/type');
    }

    const [seller, insights, simulation] = await Promise.all([
      this.advisorService.getSellerPriceSuggestion({
        city: normalized.city_norm,
        district: normalized.district_norm,
        property_type: normalized.property_type_norm,
        area_m2: areaM2,
        user_message: 'owner_strategy_center',
      }),
      this.advisorService.getInsights({
        city: normalized.city_norm,
        district: normalized.district_norm,
        property_type: normalized.property_type_norm,
        days_window: params.daysWindow,
        suggested_price_syp: priceSyp,
        area_m2: areaM2,
      }),
      this.advisorService.simulate({
        city: normalized.city_norm,
        district: normalized.district_norm,
        property_type: normalized.property_type_norm,
        area_m2: areaM2,
        proposed_price_syp: priceSyp,
        days_window: params.daysWindow,
      }),
    ]);

    const recommendations = this.buildRecommendations({
      areaM2,
      seller,
      insights,
      simulation,
    });

    const objections = this.buildObjections({
      confidence: Number(seller.confidence ?? 0),
      volatility: Number(insights.stats?.volatility_index ?? 0),
      deviationPercent: Number(simulation.deviation_percent ?? 0),
      trendDirection: simulation.trend_last_30_days.direction,
      sampleCount: Number(insights.sample_count ?? 0),
    });

    const strategyLogId = await this.advisorRequestLogService.log({
      endpoint: 'GET /owner/properties/:id/strategy',
      owner_id: requesterRole === 'OWNER' ? requesterId : undefined,
      city_norm: normalized.city_norm,
      district_norm: normalized.district_norm,
      property_type_norm: normalized.property_type_norm,
      area_key: `${normalized.city_norm}|${normalized.district_norm}|${normalized.property_type_norm}`,
      area_m2: areaM2,
      sample_count: Number(seller?.citations?.sample_count || insights.sample_count || 0),
      fx_used: Number(seller.fx_used || 0) || undefined,
      confidence: Number(seller.confidence || 0) || undefined,
      request_json: {
        city: normalized.city_norm,
        district: normalized.district_norm,
        property_type: normalized.property_type_norm,
        area_m2: areaM2,
        proposed_price_syp: priceSyp,
      },
      result_json: {
        seller,
        insights,
        simulation,
        recommendations,
        objections,
      },
      status_code: 200,
      latency_ms: 0,
    });

    return {
      property: {
        id: property.id,
        city: cityRaw,
        address: districtRaw,
        type: typeRaw,
        area: areaM2,
        price: priceSyp,
      },
      strategy_log_id: String(strategyLogId || ''),
      seller,
      insights,
      simulation,
      recommendations,
      objections,
    };
  }

  async updateOwnerPropertyPrice(params: {
    propertyId: number;
    requester: { sub?: number; role?: string };
    price: number;
  }): Promise<{ id: number; price: number }> {
    if (!Number.isFinite(params.price) || params.price <= 0) {
      throw new BadRequestException('price must be greater than 0');
    }

    const property = await this.prisma.property.findUnique({
      where: { id: params.propertyId },
      select: { id: true, ownerId: true },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const requesterRole = String(params.requester.role || '').toUpperCase();
    const requesterId = Number(params.requester.sub || 0);
    if (requesterRole === 'OWNER' && requesterId !== Number(property.ownerId)) {
      throw new ForbiddenException('You can only update your own properties');
    }

    const updated = await this.prisma.property.update({
      where: { id: params.propertyId },
      data: { price: params.price },
      select: { id: true, price: true },
    });

    return {
      id: updated.id,
      price: Number(updated.price),
    };
  }

  private buildRecommendations(params: {
    areaM2: number;
    seller: {
      optimal_price_syp: number;
      fast_sale_price_syp: number;
      confidence: number;
    };
    insights: {
      stats: {
        median_ppm2_syp: number;
        volatility_index: number;
        trend_last_30_days: { direction: 'up' | 'down' | 'flat' };
      };
    };
    simulation: {
      sale_speed_class: 'fast' | 'normal' | 'slow' | 'very_slow';
      risk_score: number;
    };
  }) {
    const medianTotal = params.insights.stats.median_ppm2_syp * params.areaM2;
    const volatility = Number(params.insights.stats.volatility_index ?? 0);
    const confidence = Number(params.seller.confidence ?? 0);
    const trend = params.insights.stats.trend_last_30_days.direction;

    const fastPrice = Math.max(
      1,
      Math.round(Math.min(params.seller.fast_sale_price_syp, medianTotal * 0.98)),
    );
    const balancedPrice = Math.max(
      1,
      Math.round((params.seller.optimal_price_syp + medianTotal) / 2),
    );

    let profitFactor = trend === 'up' ? 1.08 : trend === 'flat' ? 1.04 : 1.01;
    if (volatility > 0.25) profitFactor -= 0.02;
    if (confidence < 0.5) profitFactor -= 0.01;
    const profitPrice = Math.max(1, Math.round(Math.max(balancedPrice, medianTotal * profitFactor)));

    return {
      fast: {
        key: 'fast',
        title: 'بيع سريع',
        target_price_syp: fastPrice,
        expected_speed: 'fast',
        reason: 'سعر أقل من الوسيط لتسريع الإغلاق',
      },
      balanced: {
        key: 'balanced',
        title: 'توازن',
        target_price_syp: balancedPrice,
        expected_speed: params.simulation.sale_speed_class,
        reason: 'تسعير قريب من بيانات السوق مع مخاطرة متوسطة',
      },
      profit: {
        key: 'profit',
        title: 'تعظيم الربح',
        target_price_syp: profitPrice,
        expected_speed: trend === 'up' ? 'slow' : 'very_slow',
        reason:
          trend === 'up'
            ? 'اتجاه السوق يساعد على رفع السعر بشكل محسوب'
            : 'سعر أعلى يتطلب وقت بيع أطول',
      },
      meta: {
        market_median_total_syp: Math.round(medianTotal),
        volatility_index: volatility,
        confidence,
      },
    };
  }

  private buildObjections(params: {
    confidence: number;
    volatility: number;
    deviationPercent: number;
    trendDirection: 'up' | 'down' | 'flat';
    sampleCount: number;
  }): Array<{
    code: string;
    severity: Severity;
    message: string;
  }> {
    const objections: Array<{ code: string; severity: Severity; message: string }> = [];

    if (params.confidence < 0.4) {
      objections.push({
        code: 'low_confidence',
        severity: 'high',
        message: 'الثقة منخفضة بسبب جودة بيانات محدودة للمنطقة.',
      });
    }

    if (params.volatility > 0.25) {
      objections.push({
        code: 'high_volatility',
        severity: 'high',
        message: 'تذبذب السوق مرتفع وقد يؤثر على سرعة البيع.',
      });
    } else if (params.volatility > 0.18) {
      objections.push({
        code: 'medium_volatility',
        severity: 'medium',
        message: 'تذبذب السوق متوسط ويحتاج متابعة أقرب.',
      });
    }

    const deviation = Math.abs(params.deviationPercent);
    if (deviation > 12) {
      objections.push({
        code: 'high_deviation',
        severity: 'high',
        message: 'السعر الحالي بعيد بشكل كبير عن وسيط السوق.',
      });
    } else if (deviation > 7) {
      objections.push({
        code: 'medium_deviation',
        severity: 'medium',
        message: 'السعر الحالي أعلى/أقل من السوق بنسبة ملحوظة.',
      });
    }

    if (params.trendDirection === 'down' && params.deviationPercent > 5) {
      objections.push({
        code: 'downward_trend_high_price',
        severity: 'high',
        message: 'الاتجاه هابط مع تسعير أعلى من السوق، مما يزيد خطر بطء البيع.',
      });
    }

    if (params.sampleCount < 15) {
      objections.push({
        code: 'low_sample_count',
        severity: 'medium',
        message: 'عدد العينات قليل وقد يقلل الاعتمادية الإحصائية.',
      });
    }

    if (!objections.length) {
      objections.push({
        code: 'no_major_objection',
        severity: 'low',
        message: 'لا توجد مؤاخذات كبيرة وفق البيانات الحالية.',
      });
    }

    return objections;
  }

  private mapPropertyType(value: string): string | undefined {
    switch (value) {
      case 'APARTMENT':
        return 'apartment';
      case 'HOUSE':
        return 'house';
      case 'VILLA':
        return 'villa';
      case 'STUDIO':
        return 'studio';
      case 'LAND':
        return 'land';
      default:
        return undefined;
    }
  }
}
