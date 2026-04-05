export interface ParsedArabicMessage {
  days_window?: number;
  city?: string;
  district?: string;
  property_type?: string;
  area_m2?: number;
  budget_syp?: number;
  listing_intent?: 'SELL' | 'BUY' | 'RENT' | 'ESTIMATE' | 'INVEST';
}

export function parseArabicMessage(message: string): ParsedArabicMessage {
  const normalized = normalizeMessage(message);
  const parsed: ParsedArabicMessage = {};

  if (normalized.includes('آخر 30') || normalized.includes('اخر 30') || normalized.includes('آخر ٣٠') || normalized.includes('اخر ٣٠')) {
    parsed.days_window = 30;
  } else if (normalized.includes('آخر 90') || normalized.includes('اخر 90') || normalized.includes('آخر ٩٠') || normalized.includes('اخر ٩٠')) {
    parsed.days_window = 90;
  }

  if (
    normalized.includes('المزة') ||
    normalized.includes('مزة') ||
    normalized.includes('mazzeh') ||
    normalized.includes('mazeeh')
  ) {
    parsed.district = 'mazzeh';
    parsed.city = 'damascus';
  }

  if (
    normalized.includes('كفرسوسة') ||
    normalized.includes('كفر سوسة') ||
    normalized.includes('kafr souseh') ||
    normalized.includes('kafar souseh')
  ) {
    parsed.district = 'kafr souseh';
    parsed.city = parsed.city ?? 'damascus';
  }

  if (normalized.includes('الشعلان') || normalized.includes('shaalan')) {
    parsed.district = 'shaalan';
    parsed.city = parsed.city ?? 'damascus';
  }

  if (normalized.includes('مشروع دمر')) {
    parsed.district = 'mashrou dummar';
    parsed.city = parsed.city ?? 'damascus';
  }

  if (normalized.includes('ريف دمشق') || normalized.includes('rif dimashq')) {
    parsed.city = 'rif dimashq';
  }

  if (normalized.includes('شقق') || normalized.includes('شقة')) {
    parsed.property_type = 'apartment';
  }

  if (normalized.includes('فلل') || normalized.includes('فيلا')) {
    parsed.property_type = 'villa';
  }

  if (normalized.includes('بيت') || normalized.includes('منزل')) {
    parsed.property_type = parsed.property_type ?? 'house';
  }

  if (normalized.includes('أرض') || normalized.includes('ارض')) {
    parsed.property_type = 'land';
  }

  if (/للبيع|بيع|ابيع|أبيع|بدي ابيع|sell/i.test(normalized)) {
    parsed.listing_intent = 'SELL';
  } else if (/للشراء|شراء|اشتري|buy/i.test(normalized)) {
    parsed.listing_intent = 'BUY';
  } else if (/للإيجار|للايجار|إيجار|ايجار|rent/i.test(normalized)) {
    parsed.listing_intent = 'RENT';
  } else if (/تقييم|تسعير|كم سعر|سعرها|سعره|estimate|valuation/i.test(normalized)) {
    parsed.listing_intent = 'ESTIMATE';
  } else if (/استثمار|للاستثمار|roi|yield|investment/i.test(normalized)) {
    parsed.listing_intent = 'INVEST';
  }

  const areaMatch =
    normalized.match(/(\d+(?:\.\d+)?)\s*(?:m2|m\^2|m|م2|متر مربع|متر)/i) ??
    normalized.match(/مساحت(?:ه|ها)?\s*(\d+(?:\.\d+)?)/i);
  if (areaMatch?.[1]) {
    const area = Number(areaMatch[1]);
    if (Number.isFinite(area) && area > 0) {
      parsed.area_m2 = area;
    }
  }

  const millionMatch = normalized.match(/(\d+(?:\.\d+)?)\s*مليون/i);
  const billionMatch = normalized.match(/(\d+(?:\.\d+)?)\s*مليار/i);
  const budgetHintMatch = normalized.match(/(?:بحدود|حدود|ميزانية|بسعر|سعر)\s*(\d+(?:\.\d+)?)/i);
  if (millionMatch?.[1]) {
    parsed.budget_syp = Math.round(Number(millionMatch[1]) * 1_000_000);
  } else if (billionMatch?.[1]) {
    parsed.budget_syp = Math.round(Number(billionMatch[1]) * 1_000_000_000);
  } else if (budgetHintMatch?.[1]) {
    const raw = Number(budgetHintMatch[1]);
    if (Number.isFinite(raw) && raw > 0) {
      parsed.budget_syp = raw >= 1_000_000 ? Math.round(raw) : Math.round(raw * 1_000_000);
    }
  }

  if (parsed.area_m2 == null && parsed.budget_syp == null) {
    const looseArea = normalized.match(/\b(\d{2,4})\b/);
    if (looseArea?.[1]) {
      const area = Number(looseArea[1]);
      if (Number.isFinite(area) && area >= 20 && area <= 2000) {
        parsed.area_m2 = area;
      }
    }
  }

  return parsed;
}

function normalizeMessage(value: string): string {
  return String(value || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
