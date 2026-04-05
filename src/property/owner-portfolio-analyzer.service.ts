import { BadRequestException, Injectable } from '@nestjs/common';
import { buildExplainTrace } from '../advisor/explanation/explain-trace.helper';
import { normalizeAreaValue } from '../advisor/utils/area-normalization';
import { MarketBrainService } from '../ai/market-brain.service';
import { PrismaService } from '../prisma/prisma.service';
import { OwnerStrategyService } from './owner-strategy.service';

type AnalyzerLabel = 'OVERPRICED' | 'FAIR' | 'UNDERPRICED' | 'MISSING_FIELDS' | 'NO_MARKET_DATA';
type ApplyTarget = 'OPTIMAL' | 'FAST' | 'RAISE_TO_OPTIMAL';

@Injectable()
export class OwnerPortfolioAnalyzerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marketBrainService: MarketBrainService,
    private readonly ownerStrategyService: OwnerStrategyService,
  ) {}

  async getAnalysis(params: { ownerId: number }) {
    const ownerId = Number(params.ownerId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException('Invalid owner id');
    }

    const properties = await this.prisma.property.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        city: true,
        address: true,
        type: true,
        area: true,
        price: true,
      },
    });

    let overpriced = 0;
    let underpriced = 0;
    let fair = 0;

    const items = await Promise.all(
      properties.map(async (property) => {
        const city = String(property.city || '').trim();
        const district = this.normalizeDistrict(String(property.address || '').trim());
        const propertyType = this.mapPropertyType(property.type);
        const areaM2 = Number(property.area);
        const currentPrice = Number(property.price);

        const missing: string[] = [];
        if (!city) missing.push('city');
        if (!district) missing.push('district');
        if (!propertyType) missing.push('property_type');
        if (!Number.isFinite(areaM2) || areaM2 <= 0) missing.push('area_m2');
        if (!Number.isFinite(currentPrice) || currentPrice <= 0) missing.push('price');

        if (missing.length > 0) {
          return {
            propertyId: property.id,
            title: property.title,
            current_price_syp: Number.isFinite(currentPrice) ? Math.round(currentPrice) : 0,
            optimal_price_syp: null,
            fast_sale_price_syp: null,
            deviation_pct: null,
            label: 'MISSING_FIELDS' as AnalyzerLabel,
            recommendation: 'لازم تكمّل الحقول الناقصة قبل التحليل.',
            explain_trace: buildExplainTrace({
              inputs_used: {
                city,
                district,
                property_type: propertyType,
                area_m2: Number.isFinite(areaM2) ? areaM2 : null,
                current_price_syp: Number.isFinite(currentPrice) ? currentPrice : null,
              },
              computation_steps: [
                {
                  step: 'validation_failed',
                  value: { missing },
                },
              ],
            }),
            suggested_actions: [
              {
                type: 'OPEN_PROPERTY_EDIT',
                label_ar: 'اكمل بيانات العقار',
                property_id: property.id,
                url: `/owner/properties/${property.id}/edit`,
              },
            ],
          };
        }

        const estimate = await this.marketBrainService.estimatePriceRangeSyp({
          district,
          area_m2: areaM2,
          property_type: propertyType,
        });

        if (!estimate) {
          return {
            propertyId: property.id,
            title: property.title,
            current_price_syp: Math.round(currentPrice),
            optimal_price_syp: null,
            fast_sale_price_syp: null,
            deviation_pct: null,
            label: 'NO_MARKET_DATA' as AnalyzerLabel,
            recommendation: 'ما في بيانات سوق كافية لهذه المنطقة حالياً.',
            explain_trace: buildExplainTrace({
              inputs_used: {
                city,
                district,
                property_type: propertyType,
                area_m2: areaM2,
                current_price_syp: currentPrice,
              },
              data_sources: {
                market_data: {
                  sample_scope: `district=${district}`,
                  sample_count: 0,
                },
              },
              computation_steps: [
                {
                  step: 'market_estimate_unavailable',
                  note: 'No market_data rows found for district scope',
                },
              ],
            }),
            suggested_actions: [
              {
                type: 'OPEN_STRATEGY',
                label_ar: 'افتح مركز الاستراتيجية',
                property_id: property.id,
                url: `/owner/properties/${property.id}/strategy`,
              },
            ],
          };
        }

        const optimalPrice = Math.round(estimate.mid_syp);
        const fastSalePrice = Math.round(estimate.low_syp);
        const deviation = optimalPrice > 0 ? (currentPrice - optimalPrice) / optimalPrice : 0;

        let label: AnalyzerLabel = 'FAIR';
        let recommendation = 'السعر الحالي قريب من السوق. يفضل تثبيت السعر أو تعديل بسيط.';
        const suggested_actions: Array<Record<string, unknown>> = [];

        if (deviation > 0.15) {
          label = 'OVERPRICED';
          recommendation = 'السعر أعلى من السوق. يُفضل اعتماد السعر الأمثل أو سعر البيع السريع.';
          overpriced += 1;
          suggested_actions.push(
            {
              type: 'APPLY_PRICE',
              label_ar: 'طبق السعر الأمثل',
              property_id: property.id,
              target: 'OPTIMAL',
              price: optimalPrice,
            },
            {
              type: 'APPLY_PRICE',
              label_ar: 'طبق سعر البيع السريع',
              property_id: property.id,
              target: 'FAST',
              price: fastSalePrice,
            },
          );
        } else if (deviation < -0.1) {
          label = 'UNDERPRICED';
          recommendation = 'السعر أقل من السوق. يُنصح بالرفع التدريجي باتجاه السعر الأمثل.';
          underpriced += 1;
          suggested_actions.push({
            type: 'APPLY_PRICE',
            label_ar: 'ارفع للسعر الأمثل',
            property_id: property.id,
            target: 'RAISE_TO_OPTIMAL',
            price: optimalPrice,
          });
        } else {
          fair += 1;
          suggested_actions.push({
            type: 'OPEN_STRATEGY',
            label_ar: 'افتح مركز الاستراتيجية',
            property_id: property.id,
            url: `/owner/properties/${property.id}/strategy`,
          });
        }

        const explain_trace = buildExplainTrace({
          inputs_used: {
            city,
            district,
            property_type: propertyType,
            area_m2: areaM2,
            current_price_syp: currentPrice,
          },
          data_sources: {
            market_data: {
              sample_scope: `district=${estimate.district}`,
              avg_price_m2_syp: estimate.avg_price_m2,
            },
          },
          computation_steps: [
            {
              step: 'estimate market deterministic range via MarketBrainService',
              value: {
                low_syp: estimate.low_syp,
                mid_syp: estimate.mid_syp,
                high_syp: estimate.high_syp,
              },
            },
            {
              step: 'deviation_pct = (current_price_syp - optimal_price_syp) / optimal_price_syp',
              value: {
                current_price_syp: Math.round(currentPrice),
                optimal_price_syp: optimalPrice,
                deviation_pct: Number(deviation.toFixed(6)),
              },
            },
            {
              step: 'label by threshold',
              value: {
                over_threshold: 0.15,
                under_threshold: -0.1,
                label,
              },
            },
          ],
          confidence_components: {
            confidence:
              estimate.confidence === 'high'
                ? 0.85
                : estimate.confidence === 'medium'
                  ? 0.6
                  : 0.35,
          },
          comparables: [
            {
              current_price_syp: Math.round(currentPrice),
              optimal_price_syp: optimalPrice,
              fast_sale_price_syp: fastSalePrice,
              high_price_syp: Math.round(estimate.high_syp),
            },
          ],
        });

        return {
          propertyId: property.id,
          title: property.title,
          current_price_syp: Math.round(currentPrice),
          optimal_price_syp: optimalPrice,
          fast_sale_price_syp: fastSalePrice,
          deviation_pct: Number(deviation.toFixed(6)),
          label,
          recommendation,
          explain_trace,
          suggested_actions,
        };
      }),
    );

    return {
      summary: {
        total: properties.length,
        overpriced,
        fair,
        underpriced,
      },
      items,
    };
  }

  async applyRecommendation(params: {
    ownerId: number;
    propertyId: number;
    target: ApplyTarget;
  }) {
    const ownerId = Number(params.ownerId);
    const propertyId = Number(params.propertyId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException('Invalid owner id');
    }
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      throw new BadRequestException('propertyId must be a positive integer');
    }

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        ownerId: true,
        city: true,
        address: true,
        type: true,
        area: true,
      },
    });

    if (!property || Number(property.ownerId) !== ownerId) {
      throw new BadRequestException('Property not found for this owner');
    }

    const district = this.normalizeDistrict(String(property.address || '').trim());
    const propertyType = this.mapPropertyType(property.type);
    const areaM2 = Number(property.area);

    if (!district || !propertyType || !Number.isFinite(areaM2) || areaM2 <= 0) {
      throw new BadRequestException('Property requires district, type, and area before applying recommendation');
    }

    const estimate = await this.marketBrainService.estimatePriceRangeSyp({
      district,
      area_m2: areaM2,
      property_type: propertyType,
    });
    if (!estimate) {
      throw new BadRequestException('No market estimate available for this property');
    }

    const target = String(params.target || 'OPTIMAL').toUpperCase() as ApplyTarget;
    const targetPrice =
      target === 'FAST'
        ? Math.round(estimate.low_syp)
        : Math.round(estimate.mid_syp);

    const updated = await this.ownerStrategyService.updateOwnerPropertyPrice({
      propertyId,
      requester: { sub: ownerId, role: 'OWNER' },
      price: targetPrice,
    });

    return {
      propertyId: updated.id,
      target,
      applied_price_syp: Number(updated.price),
    };
  }

  private normalizeDistrict(value: string): string {
    const normalized = normalizeAreaValue('district', value) ?? value;
    return String(normalized || '').trim();
  }

  private mapPropertyType(value?: string | null): string {
    const key = String(value || '').toUpperCase();
    if (key === 'APARTMENT') return 'apartment';
    if (key === 'HOUSE') return 'house';
    if (key === 'VILLA') return 'villa';
    if (key === 'STUDIO') return 'studio';
    if (key === 'LAND') return 'land';
    return '';
  }
}
