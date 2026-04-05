import { formatArea, formatMoneySyp, formatPct } from './formatters';

type SuggestedAction = Record<string, unknown>;

export function buildSellerPriceReply(params: {
  district?: string;
  area_m2?: number;
  result: {
    optimal_price_syp: number;
    optimal_range_syp: { min: number; max: number };
    fast_sale_price_syp: number;
    fast_sale_range_syp: { min: number; max: number };
    confidence?: number;
  };
  market_context?: { trend_direction?: string; change_pct?: number; volatility?: number } | null;
}): { text: string; suggested_actions?: SuggestedAction[]; summary?: string } {
  const areaText = formatArea(params.area_m2);
  const districtText = params.district || 'المنطقة المحددة';
  const confidence = Number(params.result?.confidence || 0);

  const lines = [
    `تقدير البيع لعقار ${areaText} في ${districtText}:`,
    `• السعر الأفضل: ${formatMoneySyp(params.result.optimal_price_syp)} (نطاق ${formatMoneySyp(params.result.optimal_range_syp.min)} - ${formatMoneySyp(params.result.optimal_range_syp.max)}).`,
    `• للبيع السريع: ${formatMoneySyp(params.result.fast_sale_price_syp)} (نطاق ${formatMoneySyp(params.result.fast_sale_range_syp.min)} - ${formatMoneySyp(params.result.fast_sale_range_syp.max)}).`,
    `• مستوى الثقة: ${formatPct(confidence * 100, 1)}.`,
  ];

  if (params.market_context?.trend_direction) {
    lines.push(
      `• اتجاه السوق آخر 30 يوم: ${translateTrend(params.market_context.trend_direction)} (${formatPct(
        params.market_context.change_pct || 0,
        2,
      )}).`,
    );
  }

  lines.push('بدك أطبّق السعر على عقارك؟');

  return {
    text: lines.join('\n'),
    summary: `السعر الأفضل ${formatMoneySyp(params.result.optimal_price_syp)}، والسريع ${formatMoneySyp(
      params.result.fast_sale_price_syp,
    )}.`,
  };
}

export function buildBuyerEvaluateReply(params: {
  district?: string;
  area_m2?: number;
  budget_syp?: number;
  result: {
    verdict: string;
    fair_range_syp: { min: number; max: number };
    ask_price_syp: number;
    confidence?: number;
  };
  market_context?: { trend_direction?: string; change_pct?: number; volatility?: number } | null;
}): { text: string; suggested_actions?: SuggestedAction[]; summary?: string } {
  const areaText = formatArea(params.area_m2);
  const districtText = params.district || 'المنطقة المحددة';
  const verdict = translateVerdict(params.result?.verdict);
  const confidence = Number(params.result?.confidence || 0);

  const lines = [
    `تقييم السعر لعقار ${areaText} في ${districtText}:`,
    `• التقييم: ${verdict}.`,
    `• السعر المطلوب: ${formatMoneySyp(params.result.ask_price_syp)}.`,
    `• النطاق العادل: ${formatMoneySyp(params.result.fair_range_syp.min)} - ${formatMoneySyp(params.result.fair_range_syp.max)}.`,
    `• الثقة: ${formatPct(confidence * 100, 1)}.`,
  ];

  if (params.budget_syp != null) {
    lines.push(`• ميزانيتك: ${formatMoneySyp(params.budget_syp)}.`);
  }

  if (params.market_context?.trend_direction) {
    lines.push(
      `• اتجاه السوق آخر 30 يوم: ${translateTrend(params.market_context.trend_direction)} (${formatPct(
        params.market_context.change_pct || 0,
        2,
      )}).`,
    );
  }

  return {
    text: lines.join('\n'),
    summary: `التقييم ${verdict} ضمن نطاق ${formatMoneySyp(params.result.fair_range_syp.min)} - ${formatMoneySyp(
      params.result.fair_range_syp.max,
    )}.`,
  };
}

export function buildBuyerSearchReply(params: {
  mode?: 'find' | 'refine' | 'recommend';
  query: {
    city: string;
    district?: string;
    property_type: string;
    area_m2?: number;
    budget_syp?: number;
  };
  ranked_properties: Array<{
    title?: string;
    area?: number | null;
    price?: number | null;
    score?: number;
  }>;
  market_context?: { trend_direction?: string; change_pct?: number; volatility?: number } | null;
}): { text: string; suggested_actions?: SuggestedAction[]; summary?: string } {
  const count = params.ranked_properties.length;
  const districtText = params.query.district || params.query.city;
  const budgetText =
    params.query.budget_syp != null ? ` ضمن ميزانية ${formatMoneySyp(params.query.budget_syp)}` : '';

  const intro =
    params.mode === 'recommend'
      ? `بناءً على طلبك، هذه أفضل ${count} عقارات من قاعدة البيانات في ${districtText}${budgetText}.`
      : `لقيت لك ${count} عقارات أقرب لطلبك في ${districtText}${budgetText}.`;

  const lines = [intro];
  params.ranked_properties.slice(0, 3).forEach((item, idx) => {
    lines.push(
      `${idx + 1}) ${item.title || 'عقار'} — ${formatArea(item.area)} — ${formatMoneySyp(item.price)} — score ${Number(
        item.score || 0,
      ).toFixed(2)}`,
    );
  });

  if (params.market_context?.trend_direction) {
    lines.push(
      `اتجاه السوق آخر 30 يوم: ${translateTrend(params.market_context.trend_direction)} (${formatPct(
        params.market_context.change_pct || 0,
        2,
      )}).`,
    );
  }

  lines.push('تحب أفلتر أكتر؟ (مثلاً: طابق/إكساء/قرب مواصلات)');

  return {
    text: lines.join('\n'),
    summary: `تم إيجاد ${count} عقارات مرتبة حسب المطابقة.`,
  };
}

export function buildMarketTrendReply(params: {
  trend: { trend_direction: string; change_pct: number; volatility: number };
}): { text: string; summary?: string } {
  return {
    text: `اتجاه السوق: ${translateTrend(params.trend.trend_direction)} (${formatPct(
      params.trend.change_pct,
      2,
    )}) مع تذبذب ${formatPct(Number(params.trend.volatility || 0) * 100, 2)}.`,
    summary: `اتجاه ${translateTrend(params.trend.trend_direction)} (${formatPct(params.trend.change_pct, 2)}).`,
  };
}

export function buildSmallTalkReply(params: {
  kind: 'greeting' | 'thanks' | 'confirm' | 'general';
}): { text: string; suggested_actions?: SuggestedAction[]; summary?: string } {
  const replies = {
    greeting: [
      'أهلاً فيك. جاهز أساعدك بالتسعير أو تحليل السوق.',
      'مرحبا، خبرني شو بدك نحلّل اليوم.',
      'ياهلا، ابعتلي تفاصيل العقار وببدأ فوراً.',
      'أهلين، جاهز للمساعدة بأي سؤال عقاري.',
    ],
    thanks: [
      'على الرحب والسعة.',
      'يسعدني، وإذا بدك نكمل تحليل أعمق أنا جاهز.',
      'أهلاً فيك دائماً، إذا بدك تعديل على النتيجة خبرني.',
    ],
    confirm: [
      'تمام، كمّل وأنا معك خطوة بخطوة.',
      'ممتاز، ابعت الحقل الناقص ونكمل فوراً.',
      'أوكي، جاهز للتنفيذ.',
    ],
    general: [
      'ممتاز. إذا بدك نتيجة دقيقة، ابعت النوع + المساحة + المنطقة.',
      'تمام، فيني ساعدك بالتقييم أو ترتيب العقارات حسب ميزانيتك.',
      'جاهز. أعطيني تفاصيل أكتر شوي حتى أرجعلك بنتيجة أدق.',
    ],
  } as const;

  const options = replies[params.kind] || replies.general;
  const idx = Math.floor(Math.random() * options.length);
  const text = options[idx];

  return { text, summary: text };
}

function translateTrend(value?: string): string {
  const key = String(value || '').toUpperCase();
  if (key === 'UP') return 'صاعد';
  if (key === 'DOWN') return 'هابط';
  return 'مستقر';
}

function translateVerdict(value?: string): string {
  const key = String(value || '').toLowerCase();
  if (key === 'cheap') return 'أقل من العادل';
  if (key === 'fair') return 'ضمن العادل';
  if (key === 'expensive') return 'أعلى من العادل';
  return 'غير محدد';
}
