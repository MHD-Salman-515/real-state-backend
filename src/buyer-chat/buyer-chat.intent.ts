export type BuyerChatIntent =
  | 'FIND_PROPERTIES'
  | 'BUYER_REFINE'
  | 'MARKET_ANALYSIS'
  | 'AREA_COMPARISON'
  | 'INVESTMENT_ADVICE'
  | 'RENTAL_GUIDANCE'
  | 'BUYER_GUIDANCE'
  | 'PRICE_ESTIMATION'
  | 'REAL_ESTATE_FAQ'
  | 'GREETING_REAL_ESTATE'
  | 'FOLLOW_UP_CONTEXTUAL'
  | 'OUT_OF_SCOPE'
  | 'FALLBACK';

export interface ParsedBuyerSearch {
  city?: string;
  district?: string;
  area_m2?: number;
  budget?: number;
  property_type?: 'APARTMENT' | 'HOUSE' | 'VILLA' | 'STUDIO' | 'LAND';
}

export function detectBuyerChatIntent(
  message: string,
  options?: { hasLastQuery?: boolean },
): BuyerChatIntent {
  const text = normalize(message);
  const hasLastQuery = Boolean(options?.hasLastQuery);

  if (
    hasLastQuery &&
    /(ارخص|أرخص|اغلى|أغلى|كبر|صغر|رتب|بس|بدون|فلتر|نزّل|زود)/i.test(text)
  ) {
    return 'BUYER_REFINE';
  }

  if (
    /بدي\s*(شقة|بيت|منزل|فيلا|استوديو|ارض)/i.test(text) ||
    /اريد\s*(شقة|بيت|منزل|فيلا|استوديو|ارض)/i.test(text) ||
    /بدور\s*على\s*(شقة|بيت|منزل|فيلا|استوديو|ارض)/i.test(text) ||
    /(شقة|بيت|منزل|فيلا|استوديو|ارض).*\d+\s*(متر|م2|m2)/i.test(text) ||
    /بحدود\s*\d+/i.test(text)
  ) {
    return 'FIND_PROPERTIES';
  }

  return 'FALLBACK';
}

export function parseBuyerSearch(message: string): ParsedBuyerSearch {
  const text = normalize(message);

  const parsed: ParsedBuyerSearch = {};

  const type = normalizePropertyTypeFromText(text);
  if (type) parsed.property_type = type;

  if (/المزة|مزة|mazzeh|mazeeh/i.test(text)) {
    parsed.district = 'mazzeh';
    parsed.city = 'damascus';
  } else if (/كفرسوسة|كفر سوسة|kafr/i.test(text)) {
    parsed.district = 'kafr_souseh';
    parsed.city = 'damascus';
  } else if (/الشعلان|shaalan/i.test(text)) {
    parsed.district = 'shaalan';
    parsed.city = 'damascus';
  }

  const areaMatch =
    text.match(/(\d+(?:\.\d+)?)\s*(?:متر|م2|m2|m\^2|sqm|sq m)/i) ??
    text.match(/(?:مساحت(?:ه|ها)?|area)\s*(\d+(?:\.\d+)?)/i);
  if (areaMatch?.[1]) {
    const area = Number(areaMatch[1]);
    if (Number.isFinite(area) && area > 0) {
      parsed.area_m2 = area;
    }
  }

  const millionMatch = text.match(/(\d+(?:\.\d+)?)\s*مليون/i);
  const billionMatch = text.match(/(\d+(?:\.\d+)?)\s*مليار/i);
  const budgetHintMatch = text.match(/(?:بحدود|حدود|ميزانية|بسعر|سعر)\s*(\d+(?:\.\d+)?)/i);
  const englishBudgetMatch = text.match(/\b(?:under|budget|below)\s*\$?(\d+(?:\.\d+)?)\s*(k|m|million)?\b/i);

  if (millionMatch?.[1]) {
    parsed.budget = Math.round(Number(millionMatch[1]) * 1_000_000);
  } else if (billionMatch?.[1]) {
    parsed.budget = Math.round(Number(billionMatch[1]) * 1_000_000_000);
  } else if (budgetHintMatch?.[1]) {
    const raw = Number(budgetHintMatch[1]);
    if (Number.isFinite(raw) && raw > 0) {
      parsed.budget = raw >= 1_000_000 ? Math.round(raw) : Math.round(raw * 1_000_000);
    }
  } else if (englishBudgetMatch?.[1]) {
    const raw = Number(englishBudgetMatch[1]);
    const suffix = String(englishBudgetMatch[2] || '').toLowerCase();
    if (Number.isFinite(raw) && raw > 0) {
      parsed.budget =
        suffix === 'm' || suffix === 'million'
          ? Math.round(raw * 1_000_000)
          : suffix === 'k'
            ? Math.round(raw * 1_000)
            : Math.round(raw);
    }
  }

  return parsed;
}

function normalizePropertyTypeFromText(
  text: string,
): ParsedBuyerSearch['property_type'] | undefined {
  if (/شقة|\bapartment\b|\bapt\b/i.test(text)) return 'APARTMENT';
  if (/بيت|منزل|\bhouse\b/i.test(text)) return 'HOUSE';
  if (/فيلا|فلل|\bvilla\b/i.test(text)) return 'VILLA';
  if (/استوديو|ستوديو|\bstudio\b/i.test(text)) return 'STUDIO';
  if (/ارض|أرض|\bland\b|\bplot\b/i.test(text)) return 'LAND';
  return undefined;
}

function normalize(value: string): string {
  return String(value || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
