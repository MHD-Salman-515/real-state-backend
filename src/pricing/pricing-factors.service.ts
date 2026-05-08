import { Injectable } from '@nestjs/common';

export interface PricingFactors {
  floor?: number;
  hasElevator?: boolean;
  buildingAge?: 'new' | 'modern' | 'normal' | 'old' | 'very_old';
  finishQuality?: 'luxury' | 'high' | 'medium' | 'basic';
  districtTier?: 'ultra' | 'high' | 'medium' | 'low';
  nearHospital?: boolean;
  nearSchool?: boolean;
  nearSupermarket?: boolean;
  nearPark?: boolean;
  nearMainRoad?: boolean;
}

export interface PricingAdjustment {
  totalMultiplier: number;
  breakdown: Record<string, number>;
  explanation: string[];
}

@Injectable()
export class PricingFactorsService {

  calculateAdjustment(factors: PricingFactors): PricingAdjustment {
    const breakdown: Record<string, number> = {};
    const explanation: string[] = [];
    let total = 1.0;

    // ── District tier bonus ──────────────────────────────
    const tierBonus: Record<string, number> = {
      ultra:  1.35,
      high:   1.20,
      medium: 1.00,
      low:    0.80,
    };
    if (factors.districtTier) {
      const bonus = tierBonus[factors.districtTier] ?? 1.0;
      breakdown['district_tier'] = bonus;
      total *= bonus;
      const label: Record<string, string> = {
        ultra: 'منطقة راقية جداً',
        high: 'منطقة راقية',
        medium: 'منطقة متوسطة',
        low: 'منطقة شعبية',
      };
      explanation.push(`${label[factors.districtTier]}: ×${bonus}`);
    }

    // ── Floor factor ─────────────────────────────────────
    if (factors.floor !== undefined) {
      let floorMultiplier = 1.0;
      const hasElevator = factors.hasElevator ?? true;

      if (factors.floor === 0) {
        floorMultiplier = 0.93;
        explanation.push('طابق أرضي: -7%');
      } else if (factors.floor === 1) {
        floorMultiplier = 1.02;
        explanation.push('طابق أول: +2%');
      } else if (factors.floor === 2) {
        floorMultiplier = 1.05;
        explanation.push('طابق ثاني: +5%');
      } else if (factors.floor === 3) {
        floorMultiplier = 1.03;
        explanation.push('طابق ثالث: +3%');
      } else if (factors.floor === 4) {
        floorMultiplier = 1.01;
        explanation.push('طابق رابع: +1%');
      } else if (factors.floor >= 5) {
        floorMultiplier = hasElevator ? 1.00 : 0.90;
        explanation.push(hasElevator
          ? `طابق ${factors.floor} مع مصعد: ±0%`
          : `طابق ${factors.floor} بدون مصعد: -10%`);
      }
      breakdown['floor'] = floorMultiplier;
      total *= floorMultiplier;
    }

    // ── Building age ─────────────────────────────────────
    if (factors.buildingAge) {
      const ageMap: Record<string, [number, string]> = {
        new:      [1.12, 'بناء جديد: +12%'],
        modern:   [1.06, 'بناء حديث: +6%'],
        normal:   [1.00, 'بناء عادي: ±0%'],
        old:      [0.92, 'بناء قديم: -8%'],
        very_old: [0.82, 'بناء مهترئ: -18%'],
      };
      const [multiplier, label] = ageMap[factors.buildingAge];
      breakdown['building_age'] = multiplier;
      total *= multiplier;
      explanation.push(label);
    }

    // ── Finish quality ───────────────────────────────────
    if (factors.finishQuality) {
      const finishMap: Record<string, [number, string]> = {
        luxury: [1.15, 'تشطيب فاخر: +15%'],
        high:   [1.08, 'تشطيب عالي: +8%'],
        medium: [1.00, 'تشطيب عادي: ±0%'],
        basic:  [0.90, 'تشطيب بسيط: -10%'],
      };
      const [multiplier, label] = finishMap[factors.finishQuality];
      breakdown['finish_quality'] = multiplier;
      total *= multiplier;
      explanation.push(label);
    }

    // ── Nearby services (Google Places results) ──────────
    if (factors.nearHospital) {
      breakdown['near_hospital'] = 1.03;
      total *= 1.03;
      explanation.push('قرب من مستشفى: +3%');
    }
    if (factors.nearSchool) {
      breakdown['near_school'] = 1.02;
      total *= 1.02;
      explanation.push('قرب من مدرسة: +2%');
    }
    if (factors.nearSupermarket) {
      breakdown['near_supermarket'] = 1.02;
      total *= 1.02;
      explanation.push('قرب من سوبرماركت: +2%');
    }
    if (factors.nearPark) {
      breakdown['near_park'] = 1.02;
      total *= 1.02;
      explanation.push('قرب من حديقة: +2%');
    }
    if (factors.nearMainRoad) {
      breakdown['near_main_road'] = 1.01;
      total *= 1.01;
      explanation.push('قرب من طريق رئيسي: +1%');
    }

    return {
      totalMultiplier: Math.round(total * 1000) / 1000,
      breakdown,
      explanation,
    };
  }

  applyToPrice(basePrice: number, factors: PricingFactors): {
    adjustedPrice: number;
    adjustment: PricingAdjustment;
  } {
    const adjustment = this.calculateAdjustment(factors);
    return {
      adjustedPrice: Math.round(basePrice * adjustment.totalMultiplier),
      adjustment,
    };
  }
}
