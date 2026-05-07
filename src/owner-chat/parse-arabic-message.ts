export interface ParsedArabicMessage {
  days_window?: number;
  city?: string;
  district?: string;
  property_type?: string;
  area_m2?: number;
  budget_syp?: number;
  listing_intent?: 'SELL' | 'BUY' | 'RENT' | 'ESTIMATE' | 'INVEST';
}

const DISTRICT_MAP: Array<{ triggers: string[]; district: string; city: string }> = [
  // Damascus Ultra
  { triggers: ['المالكي', 'مالكي', 'malki'], district: 'malki', city: 'damascus' },
  { triggers: ['أبو رمانة', 'ابو رمانة', 'abu rummaneh'], district: 'abu rummaneh', city: 'damascus' },
  { triggers: ['المهاجرين', 'مهاجرين', 'muhajireen'], district: 'muhajireen', city: 'damascus' },
  { triggers: ['بغداد', 'baghdad street', 'شارع بغداد'], district: 'baghdad', city: 'damascus' },
  { triggers: ['الشعلان', 'شعلان', 'shaalan', 'shaalaan'], district: 'shaalaan', city: 'damascus' },
  { triggers: ['حي الأمين', 'الأمين', 'hay al ameen'], district: 'hay al ameen', city: 'damascus' },
  { triggers: ['خالد بن الوليد', 'خالد ابن الوليد'], district: 'khaled ibn al walid', city: 'damascus' },
  { triggers: ['مشروع دمر', 'دمر'], district: 'mashrou dummar', city: 'damascus' },
  // Damascus High
  { triggers: ['المزة', 'مزة', 'mazzeh', 'mazeeh'], district: 'mazzeh', city: 'damascus' },
  { triggers: ['كفرسوسة', 'كفر سوسة', 'kafr souseh', 'kafar souseh', 'kafr sousa'], district: 'kafr sousa', city: 'damascus' },
  { triggers: ['الصالحية', 'صالحية', 'salihiyeh'], district: 'salihiyeh', city: 'damascus' },
  { triggers: ['الروضة', 'روضة', 'rawda'], district: 'rawda', city: 'damascus' },
  // Damascus Medium
  { triggers: ['ركن الدين', 'ركن دين', 'rukn al-din'], district: 'rukn al-din', city: 'damascus' },
  { triggers: ['الميدان', 'ميدان', 'midan'], district: 'midan', city: 'damascus' },
  { triggers: ['البرامكة', 'برامكة', 'baramkeh'], district: 'baramkeh', city: 'damascus' },
  { triggers: ['القصاع', 'قصاع', 'qassaa'], district: 'qassaa', city: 'damascus' },
  // Damascus Historic
  { triggers: ['دمشق القديمة', 'المدينة القديمة', 'old damascus'], district: 'old damascus', city: 'damascus' },
  { triggers: ['باب شرقي', 'bab sharqi'], district: 'bab sharqi', city: 'damascus' },
  // Damascus Low
  { triggers: ['جوبر', 'jobar'], district: 'jobar', city: 'damascus' },
  { triggers: ['التضامن', 'تضامن', 'tadamon'], district: 'tadamon', city: 'damascus' },
  { triggers: ['القدم', 'قدم', 'qadam'], district: 'qadam', city: 'damascus' },
  // Rif Dimashq
  { triggers: ['قدسيا', 'ضاحية قدسيا', 'qudsaya'], district: 'qudsaya project', city: 'rif dimashq' },
  { triggers: ['جرمانا', 'jaramana'], district: 'jaramana', city: 'rif dimashq' },
  { triggers: ['داريا', 'darayya'], district: 'darayya', city: 'rif dimashq' },
  { triggers: ['حرستا', 'harasta'], district: 'harasta', city: 'rif dimashq' },
  { triggers: ['جديدة الشيباني', 'الشيباني'], district: 'jadidat al sheibani', city: 'rif dimashq' },
  { triggers: ['عرطوز', 'artouz'], district: 'artouz', city: 'rif dimashq' },
  { triggers: ['صحنايا', 'sahnaya'], district: 'sahnaya', city: 'rif dimashq' },
  { triggers: ['المليحة', 'مليحة', 'mleiha'], district: 'mleiha', city: 'rif dimashq' },
  // Aleppo
  { triggers: ['العزيزية', 'عزيزية', 'aziziyeh'], district: 'aziziyeh', city: 'aleppo' },
  { triggers: ['الحمدانية', 'حمدانية', 'hamdaniyeh'], district: 'hamdaniyeh', city: 'aleppo' },
  // Homs
  { triggers: ['الوعر', 'وعر', 'al waer'], district: 'al waer', city: 'homs' },
  { triggers: ['الحميدية', 'حميدية', 'al hamidiyah'], district: 'al hamidiyah', city: 'homs' },
];

export function parseArabicMessage(message: string): ParsedArabicMessage {
  const normalized = normalizeMessage(message);
  const parsed: ParsedArabicMessage = {};

  if (normalized.includes('آخر 30') || normalized.includes('اخر 30') || normalized.includes('آخر ٣٠') || normalized.includes('اخر ٣٠')) {
    parsed.days_window = 30;
  } else if (normalized.includes('آخر 90') || normalized.includes('اخر 90') || normalized.includes('آخر ٩٠') || normalized.includes('اخر ٩٠')) {
    parsed.days_window = 90;
  }

  for (const { triggers, district, city } of DISTRICT_MAP) {
    if (triggers.some((t) => normalized.includes(t.toLowerCase()))) {
      parsed.district = district;
      parsed.city = city;
      break;
    }
  }

  if (!parsed.city && (normalized.includes('ريف دمشق') || normalized.includes('rif dimashq'))) {
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
