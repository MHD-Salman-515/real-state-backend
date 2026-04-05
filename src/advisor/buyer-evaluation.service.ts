import { Injectable } from '@nestjs/common';

export interface BuyerEvaluationInput {
  offered_price_syp: number;
  reference_price_syp: number;
}

export interface BuyerEvaluationResult {
  delta_syp: number;
  delta_percent: number;
  verdict: 'under' | 'fair' | 'over';
}

@Injectable()
export class BuyerEvaluationService {
  evaluate(input: BuyerEvaluationInput): BuyerEvaluationResult {
    const offered = Number(input.offered_price_syp);
    const reference = Number(input.reference_price_syp);

    if (!Number.isFinite(offered) || !Number.isFinite(reference) || reference <= 0) {
      return {
        delta_syp: 0,
        delta_percent: 0,
        verdict: 'fair',
      };
    }

    const delta = offered - reference;
    const deltaPercent = (delta / reference) * 100;

    let verdict: BuyerEvaluationResult['verdict'] = 'fair';
    if (deltaPercent < -5) {
      verdict = 'under';
    } else if (deltaPercent > 5) {
      verdict = 'over';
    }

    return {
      delta_syp: Math.round(delta),
      delta_percent: Number(deltaPercent.toFixed(2)),
      verdict,
    };
  }
}
