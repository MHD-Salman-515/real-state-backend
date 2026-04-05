import { Injectable } from '@nestjs/common';
import {
  BuyerVerdict,
  SellerPriceSummaryInput,
} from '../advisor.types';
import { AdvisorLanguage } from '../utils/language-detector';

@Injectable()
export class AdvisorExplanationService {
  buildSellerSummary(input: SellerPriceSummaryInput): string {
    const optimal = this.formatSyp(input.optimal_price_syp);
    const fast = this.formatSyp(input.fast_sale_price_syp);

    if (input.language === 'en') {
      return `Best list price is about ${optimal} SYP; for a faster sale, use ${fast} SYP.`;
    }

    if (input.language === 'msa') {
      return `السعر الأنسب للعرض نحو ${optimal} ليرة سورية، وللبيع السريع نحو ${fast}.`;
    }

    return `الأفضل تعرضه حوالي ${optimal} ل.س، وإذا بدك تبيع أسرع خليه ${fast} ل.س.`;
  }

  private formatSyp(value: number): string {
    return value.toLocaleString('en-US');
  }

  buildBuyerSummary(input: {
    language: AdvisorLanguage;
    verdict: BuyerVerdict;
    ask: number;
    min: number;
    max: number;
  }): string {
    const ask = this.formatSyp(input.ask);
    const min = this.formatSyp(input.min);
    const max = this.formatSyp(input.max);

    if (input.language === 'en') {
      return `Asking ${ask} SYP. Fair range is ${min}-${max}. Verdict: ${input.verdict}.`;
    }

    if (input.language === 'msa') {
      return `السعر المطلوب ${ask} ليرة سورية. النطاق العادل ${min}-${max}. التقييم: ${this.toMsaVerdict(input.verdict)}.`;
    }

    return `السعر المطلوب ${ask} ل.س. العادل بين ${min} و ${max}. تقييمي: ${this.toSyrianVerdict(input.verdict)}.`;
  }

  private toSyrianVerdict(verdict: BuyerVerdict): string {
    if (verdict === 'cheap') {
      return 'رخيص';
    }

    if (verdict === 'expensive') {
      return 'غالي';
    }

    return 'مناسب';
  }

  private toMsaVerdict(verdict: BuyerVerdict): string {
    if (verdict === 'cheap') {
      return 'منخفض';
    }

    if (verdict === 'expensive') {
      return 'مرتفع';
    }

    return 'مناسب';
  }
}
