import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeAreaValue } from '../advisor/utils/area-normalization';
import { ComparableEngineService, RankedComparable } from './comparable-engine.service';
import { computeMedian } from './similarity-score.util';

export type EvaluateMarketInput = {
  city: string;
  district?: string;
  property_type: string;
  area_m2: number;
  bedrooms?: number;
  ask_price: number;
};

export type EvaluateMarketResult = {
  estimated_price: number;
  average_price_per_m2: number;
  median_price_per_m2: number;
  comparables_found: number;
  evaluation: 'underpriced' | 'fair_price' | 'overpriced';
  difference_percent: number;
  selected_comparables: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
};

@Injectable()
export class MarketPricingService {
  constructor(private readonly comparableEngine: ComparableEngineService) {}

  async evaluate(input: EvaluateMarketInput): Promise<EvaluateMarketResult> {
    if (!Number.isFinite(input.ask_price) || input.ask_price <= 0) {
      throw new BadRequestException('ask_price must be a positive number');
    }

    const result = await this.comparableEngine.findComparables({
      city: input.city,
      district: input.district,
      property_type: input.property_type,
      area_m2: input.area_m2,
      bedrooms: input.bedrooms,
    });

    const pricePerM2Values = result.comparables
      .map((item) => item.price_per_m2)
      .filter(
        (value): value is number =>
          value != null && Number.isFinite(value) && value > 0,
      );

    if (pricePerM2Values.length === 0) {
      return {
        estimated_price: 0,
        average_price_per_m2: 0,
        median_price_per_m2: 0,
        comparables_found: 0,
        evaluation: 'fair_price',
        difference_percent: 0,
        selected_comparables: 0,
        confidence: 'VERY_LOW',
      };
    }

    const averagePricePerM2 =
      pricePerM2Values.reduce((sum, value) => sum + value, 0) / pricePerM2Values.length;
    const medianPricePerM2 = computeMedian(pricePerM2Values);
    const estimatedPrice = medianPricePerM2 * input.area_m2;
    const differencePercent =
      estimatedPrice > 0
        ? ((input.ask_price - estimatedPrice) / estimatedPrice) * 100
        : 0;

    let evaluation: EvaluateMarketResult['evaluation'] = 'fair_price';
    if (input.ask_price < estimatedPrice * 0.9) {
      evaluation = 'underpriced';
    } else if (input.ask_price > estimatedPrice * 1.1) {
      evaluation = 'overpriced';
    }

    return {
      estimated_price: Math.round(estimatedPrice),
      average_price_per_m2: Number(averagePricePerM2.toFixed(2)),
      median_price_per_m2: Number(medianPricePerM2.toFixed(2)),
      comparables_found: result.totalMatched,
      evaluation,
      difference_percent: Number(differencePercent.toFixed(2)),
      selected_comparables: result.comparables.length,
      confidence: this.resolveConfidence(result.comparables.length),
    };
  }

  async getSimilar(input: {
    city: string;
    district?: string;
    property_type: string;
    area_m2: number;
    bedrooms?: number;
  }): Promise<{
    area_scope: {
      city: string;
      district?: string;
      property_type: string;
      area_m2: number;
      bedrooms?: number;
    };
    comparables_found: number;
    comparables: RankedComparable[];
  }> {
    const result = await this.comparableEngine.findComparables(input);

    return {
      area_scope: {
        city: normalizeAreaValue('city', input.city) ?? input.city,
        ...(input.district
          ? {
              district:
                normalizeAreaValue('district', input.district) ?? input.district,
            }
          : {}),
        property_type:
          normalizeAreaValue('property_type', input.property_type)
          ?? input.property_type,
        area_m2: input.area_m2,
        ...(typeof input.bedrooms === 'number' ? { bedrooms: input.bedrooms } : {}),
      },
      comparables_found: result.totalMatched,
      comparables: result.comparables,
    };
  }

  private resolveConfidence(
    count: number,
  ): EvaluateMarketResult['confidence'] {
    if (count >= 10) {
      return 'HIGH';
    }
    if (count >= 5) {
      return 'MEDIUM';
    }
    if (count >= 3) {
      return 'LOW';
    }
    return 'VERY_LOW';
  }
}
