import { Injectable } from '@nestjs/common';
import { MarketTrendService } from '../../market-intelligence/market-trend.service';

interface CandidateProperty {
  id: number;
  title: string;
  city: string;
  address: string | null;
  area: number | null;
  price: number | null;
  type: string;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RankParams {
  city?: string;
  district?: string;
  property_type?: string;
  area_m2?: number;
  budget_syp?: number;
  days?: number;
}

export interface RankedPropertyResult {
  property: CandidateProperty;
  score: number;
  reasons: {
    price_match: number;
    area_match: number;
    type_match: number;
    location_match: number;
    district_match: number;
    freshness: number;
    market_trend: number;
    investment_fit: number;
    trend_direction: 'UP' | 'DOWN' | 'STABLE';
    change_pct: number;
    trend_volatility: number;
  };
}

@Injectable()
export class PropertyRankingService {
  private readonly weights = {
    price_match: 0.3,
    area_match: 0.2,
    type_match: 0.15,
    location_match: 0.15,
    district_match: 0.1,
    freshness: 0.05,
    market_trend: 0.03,
    investment_fit: 0.02,
  } as const;

  constructor(private readonly marketTrendService: MarketTrendService) {}

  async rankProperties(
    params: RankParams,
    candidates: CandidateProperty[],
  ): Promise<RankedPropertyResult[]> {
    const days = Number.isInteger(params.days) && Number(params.days) > 0 ? Number(params.days) : 30;

    const ranked = await Promise.all(
      candidates.map(async (property) => {
        const price = Number(property.price);
        const area = Number(property.area);
        const budget = Number(params.budget_syp);
        const wantedArea = Number(params.area_m2);

        let priceMatch = 0.8;
        if (Number.isFinite(budget) && budget > 0 && Number.isFinite(price) && price > 0) {
          const diff = Math.abs(price - budget);
          priceMatch = this.clamp01(1 - diff / (budget * 0.35));
        }

        let areaMatch = 0.8;
        if (Number.isFinite(wantedArea) && wantedArea > 0 && Number.isFinite(area) && area > 0) {
          const diff = Math.abs(area - wantedArea);
          areaMatch = this.clamp01(1 - diff / 40);
        }

        let typeMatch = 0.8;
        if (params.property_type) {
          const normalizedWanted = String(params.property_type).toUpperCase();
          const normalizedType = String(property.type || '').toUpperCase();
          typeMatch = normalizedType === normalizedWanted ? 1 : 0.4;
        }

        let locationMatch = 0.8;
        if (params.city) {
          const cityMatch = String(property.city || '').toLowerCase() === String(params.city || '').toLowerCase();
          locationMatch = cityMatch ? 1 : 0.6;
        }

        let districtMatch = 0.75;
        if (params.district) {
          const districtNeedle = String(params.district || '').trim().toLowerCase();
          const addressText = String(property.address || '').trim().toLowerCase();
          districtMatch = addressText.includes(districtNeedle) ? 1 : 0.35;
        }

        const now = Date.now();
        const createdAt = new Date(property.createdAt);
        const daysOld = Math.max(0, (now - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const freshness = this.clamp01(1 - daysOld / 180);

        let trendDirection: 'UP' | 'DOWN' | 'STABLE' = 'STABLE';
        let changePct = 0;
        let trendVolatility = 0;
        let marketTrendFactor = 0.8;
        let investmentFit = 0.75;

        try {
          const trendDistrict = params.district || String(property.address || '').trim() || 'mazzeh';
          const trendType = params.property_type || String(property.type || '').toLowerCase();
          const trendCity = params.city || String(property.city || 'damascus');

          const trend = await this.marketTrendService.getTrend({
            city: trendCity,
            district: trendDistrict,
            property_type: trendType,
            days,
          });
          trendDirection = trend.trend_direction;
          changePct = trend.change_pct;
          trendVolatility = trend.volatility;

          if (trend.trend_direction === 'UP') marketTrendFactor = 0.6;
          else if (trend.trend_direction === 'DOWN') marketTrendFactor = 0.9;
          else marketTrendFactor = 0.8;

          investmentFit = this.clamp01(
            0.7 +
              (trend.trend_direction === 'DOWN' ? 0.15 : trend.trend_direction === 'STABLE' ? 0.08 : 0.02) -
              Math.min(0.12, trend.volatility * 0.4),
          );
        } catch {
          marketTrendFactor = 0.8;
          investmentFit = 0.75;
        }

        const score =
          this.weights.price_match * priceMatch +
          this.weights.area_match * areaMatch +
          this.weights.type_match * typeMatch +
          this.weights.location_match * locationMatch +
          this.weights.district_match * districtMatch +
          this.weights.freshness * freshness +
          this.weights.market_trend * marketTrendFactor +
          this.weights.investment_fit * investmentFit;

        return {
          property,
          score: Number(score.toFixed(6)),
          reasons: {
            price_match: Number(priceMatch.toFixed(6)),
            area_match: Number(areaMatch.toFixed(6)),
            type_match: Number(typeMatch.toFixed(6)),
            location_match: Number(locationMatch.toFixed(6)),
            district_match: Number(districtMatch.toFixed(6)),
            freshness: Number(freshness.toFixed(6)),
            market_trend: Number(marketTrendFactor.toFixed(6)),
            investment_fit: Number(investmentFit.toFixed(6)),
            trend_direction: trendDirection,
            change_pct: Number(changePct.toFixed(4)),
            trend_volatility: Number(trendVolatility.toFixed(6)),
          },
        } satisfies RankedPropertyResult;
      }),
    );

    ranked.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const budget = Number(params.budget_syp);
      if (!Number.isFinite(budget) || budget <= 0) {
        return new Date(b.property.updatedAt).getTime() - new Date(a.property.updatedAt).getTime();
      }
      const aDiff = Math.abs(Number(a.property.price || 0) - budget);
      const bDiff = Math.abs(Number(b.property.price || 0) - budget);
      if (aDiff !== bDiff) return aDiff - bDiff;
      return new Date(b.property.updatedAt).getTime() - new Date(a.property.updatedAt).getTime();
    });

    return ranked;
  }

  getWeights() {
    return this.weights;
  }

  private clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }
}
