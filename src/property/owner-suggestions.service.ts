import { Injectable } from '@nestjs/common';
import { AdvisorRequestLogService } from '../advisor/advisor-request-log.service';
import { OwnerPortfolioService } from './owner-portfolio.service';

interface SuggestionAction {
  code:
    | 'apply_fast'
    | 'apply_balanced'
    | 'apply_profit'
    | 'fix_missing'
    | 'watch'
    | 'ok';
  title_ar: string;
  description_ar: string;
  recommended_price_syp?: number;
}

@Injectable()
export class OwnerSuggestionsService {
  constructor(
    private readonly ownerPortfolioService: OwnerPortfolioService,
    private readonly advisorRequestLogService: AdvisorRequestLogService,
  ) {}

  async getSuggestions(params: {
    ownerId: number;
    daysWindow: number;
    limit: number;
  }) {
    const portfolio = await this.ownerPortfolioService.getPortfolio(params);
    const mapped = await Promise.all(
      (portfolio.items || []).map(async (item) => this.toSuggestion(item, params.ownerId)),
    );

    mapped.sort(
      (a, b) =>
        Number(b?.priority?.score || 0) - Number(a?.priority?.score || 0),
    );

    return {
      days_window: params.daysWindow,
      items: mapped,
    };
  }

  private async toSuggestion(item: any, ownerId: number) {
    const property = item?.property || {};
    const ai = item?.ai || {};

    if (ai?.status === 'missing_fields') {
      const missing = Array.isArray(ai?.missing) ? ai.missing : [];
      return {
        property: this.minProperty(property),
        priority: { score: 1, label: 'sell_now' },
        action: {
          code: 'fix_missing',
          title_ar: 'أكمل بيانات العقار',
          description_ar: 'لا يمكن توليد توصية سعرية قبل استكمال الحقول الأساسية.',
        } as SuggestionAction,
        reasons_ar: missing.map((m: string) => `حقل ناقص: ${m}`),
      };
    }

    const priority = ai?.priority || { score: 0, label: 'ok' };
    const seller = ai?.seller || {};
    const reasons = Array.isArray(priority?.reasons) ? priority.reasons : [];

    let action: SuggestionAction = {
      code: 'ok',
      title_ar: 'الوضع جيد',
      description_ar: 'التسعير الحالي قريب من السوق، لا إجراء فوري.',
    };
    if (priority.label === 'sell_now') {
      action = {
        code: 'apply_fast',
        title_ar: 'غيّر السعر الآن',
        description_ar: 'اعتماد سعر البيع السريع يرفع احتمالية إغلاق أسرع.',
        recommended_price_syp: Number(seller.fast_sale_price_syp || 0) || undefined,
      };
    } else if (priority.label === 'watch') {
      action = {
        code: 'apply_balanced',
        title_ar: 'اعتمد السعر المتوازن',
        description_ar: 'السعر الأمثل يوازن بين سرعة البيع وقيمة أعلى.',
        recommended_price_syp: Number(seller.optimal_price_syp || 0) || undefined,
      };
    }

    let logId: string | undefined;
    if (action.recommended_price_syp && action.recommended_price_syp > 0) {
      logId = await this.advisorRequestLogService.log({
        endpoint: 'GET /owner/suggestions',
        owner_id: ownerId,
        city_norm: property.city || undefined,
        district_norm: property.address || undefined,
        property_type_norm: this.mapTypeToNorm(property.type),
        area_m2: Number(property.area || 0) || undefined,
        confidence: Number(seller.confidence || 0) || undefined,
        fx_used: Number(seller.fx_used || 0) || undefined,
        request_json: {
          city: property.city || null,
          district: property.address || null,
          property_type: this.mapTypeToNorm(property.type),
          area_m2: Number(property.area || 0) || null,
          proposed_price_syp: Number(property.price || 0) || null,
        },
        result_json: {
          seller: ai.seller,
          insights: ai.insights,
          simulation: ai.simulation,
          priority: ai.priority,
          action,
        },
        status_code: 200,
        latency_ms: 0,
      });
    }

    return {
      property: this.minProperty(property),
      priority: {
        score: Number(priority.score || 0),
        label: priority.label,
      },
      action,
      reasons_ar: reasons,
      ...(logId ? { log_id: logId } : {}),
    };
  }

  private minProperty(property: any) {
    return {
      id: property.id,
      title: property.title,
      city: property.city,
      address: property.address,
      type: property.type,
      area: property.area,
      price: property.price,
    };
  }

  private mapTypeToNorm(type?: string): string | undefined {
    const key = String(type || '').toUpperCase();
    if (key === 'APARTMENT') return 'apartment';
    if (key === 'HOUSE') return 'house';
    if (key === 'VILLA') return 'villa';
    if (key === 'STUDIO') return 'studio';
    if (key === 'LAND') return 'land';
    return undefined;
  }
}
