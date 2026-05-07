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
  { triggers: ['أبو رمانة', 'ابو رمانة', 'ابو رمانه', 'abu rummaneh'], district: 'abu rummaneh', city: 'damascus' },
  { triggers: ['المهاجرين', 'مهاجرين', 'muhajireen'], district: 'muhajireen', city: 'damascus' },
  { triggers: ['الروضة', 'روضة', 'rawda'], district: 'rawda', city: 'damascus' },
  { triggers: ['شارع بغداد', 'baghdad street'], district: 'baghdad street', city: 'damascus' },
  { triggers: ['الشعلان', 'شعلان', 'shaalan', 'shaalaan'], district: 'shaalaan', city: 'damascus' },
  { triggers: ['خالد بن الوليد', 'خالد ابن الوليد'], district: 'khaled ibn al walid', city: 'damascus' },
  { triggers: ['مشروع دمر', 'دمر', 'dummar'], district: 'mashrou dummar', city: 'damascus' },
  { triggers: ['حي الأمين', 'الأمين', 'hay al ameen'], district: 'hay al ameen', city: 'damascus' },
  // Damascus High
  { triggers: ['المزة فيلات', 'فيلات المزة', 'mazzeh villas'], district: 'mazzeh villas west', city: 'damascus' },
  { triggers: ['المزة', 'مزة', 'mazzeh', 'mazeeh'], district: 'mazzeh', city: 'damascus' },
  { triggers: ['كفرسوسة', 'كفر سوسة', 'kafr souseh', 'kafar souseh', 'kafr sousa'], district: 'kafr sousa', city: 'damascus' },
  { triggers: ['الصالحية', 'صالحية', 'salihiyeh'], district: 'salihiyeh', city: 'damascus' },
  { triggers: ['المزرعة', 'مزرعة', 'mazraa'], district: 'mazraa', city: 'damascus' },
  { triggers: ['الجلاء', 'جلاء', 'jalaa'], district: 'jalaa', city: 'damascus' },
  { triggers: ['الشهداء', 'شهداء', 'shuhada'], district: 'shuhada', city: 'damascus' },
  // Damascus Medium
  { triggers: ['ركن الدين', 'ركن دين', 'rukn al-din'], district: 'rukn al-din', city: 'damascus' },
  { triggers: ['القصاع', 'قصاع', 'qassaa'], district: 'qassaa', city: 'damascus' },
  { triggers: ['البرامكة', 'برامكة', 'baramkeh'], district: 'baramkeh', city: 'damascus' },
  { triggers: ['الميدان', 'ميدان', 'midan'], district: 'midan', city: 'damascus' },
  { triggers: ['الحجاز', 'hijaz'], district: 'hijaz', city: 'damascus' },
  { triggers: ['المجتهد', 'مجتهد', 'mujtahid'], district: 'mujtahid', city: 'damascus' },
  { triggers: ['الأنصاري', 'انصاري', 'ansari'], district: 'ansari', city: 'damascus' },
  { triggers: ['كشكول', 'kashkoul'], district: 'kashkoul', city: 'damascus' },
  { triggers: ['الورود', 'ورود', 'wuroud'], district: 'wuroud', city: 'damascus' },
  // Damascus Historic
  { triggers: ['دمشق القديمة', 'المدينة القديمة', 'old damascus'], district: 'old damascus', city: 'damascus' },
  { triggers: ['القيمرية', 'qaymariyeh'], district: 'qaymariyeh', city: 'damascus' },
  { triggers: ['باب شرقي', 'bab sharqi'], district: 'bab sharqi', city: 'damascus' },
  { triggers: ['باب توما', 'bab touma'], district: 'bab touma', city: 'damascus' },
  { triggers: ['الحريقة', 'حريقة', 'hariqah'], district: 'hariqah', city: 'damascus' },
  { triggers: ['ساروجة', 'sarouja'], district: 'sarouja', city: 'damascus' },
  { triggers: ['الشاغور', 'شاغور', 'shaghour'], district: 'shaghour', city: 'damascus' },
  { triggers: ['القنوات', 'qanawat'], district: 'qanawat', city: 'damascus' },
  // Damascus Low
  { triggers: ['جوبر', 'jobar'], district: 'jobar', city: 'damascus' },
  { triggers: ['التضامن', 'تضامن', 'tadamon'], district: 'tadamon', city: 'damascus' },
  { triggers: ['القدم', 'قدم', 'qadam'], district: 'qadam', city: 'damascus' },
  { triggers: ['عش الورور', 'ush al wawur'], district: 'ush al wawur', city: 'damascus' },
  { triggers: ['القابون', 'قابون', 'qaboun'], district: 'qaboun', city: 'damascus' },
  { triggers: ['برزة', 'barzeh'], district: 'barzeh', city: 'damascus' },
  { triggers: ['دويلعة', 'duwaylah'], district: 'duwaylah', city: 'damascus' },
  // Rif Dimashq High
  { triggers: ['قدسيا', 'ضاحية قدسيا', 'qudsaya'], district: 'qudsaya', city: 'rif dimashq' },
  { triggers: ['الهامة', 'هامة', 'hameh'], district: 'hameh', city: 'rif dimashq' },
  { triggers: ['عين الفيجة', 'ain al fijah'], district: 'ain al fijah', city: 'rif dimashq' },
  { triggers: ['الزبداني', 'زبداني', 'zabadani'], district: 'zabadani', city: 'rif dimashq' },
  { triggers: ['بلودان', 'bludan'], district: 'bludan', city: 'rif dimashq' },
  { triggers: ['صيدنايا', 'saidnaya'], district: 'saidnaya', city: 'rif dimashq' },
  { triggers: ['معلولا', 'maalula'], district: 'maalula', city: 'rif dimashq' },
  // Rif Dimashq Medium
  { triggers: ['جرمانا', 'jaramana'], district: 'jaramana', city: 'rif dimashq' },
  { triggers: ['داريا', 'darayya'], district: 'darayya', city: 'rif dimashq' },
  { triggers: ['حرستا', 'harasta'], district: 'harasta', city: 'rif dimashq' },
  { triggers: ['جديدة الشيباني', 'الشيباني'], district: 'jadidat al sheibani', city: 'rif dimashq' },
  { triggers: ['دوما', 'douma'], district: 'douma', city: 'rif dimashq' },
  { triggers: ['عدرا', 'adra'], district: 'adra', city: 'rif dimashq' },
  { triggers: ['التل', 'tal'], district: 'tal', city: 'rif dimashq' },
  { triggers: ['قطنا', 'qatana'], district: 'qatana', city: 'rif dimashq' },
  { triggers: ['السيدة زينب', 'sayyida zainab'], district: 'sayyida zainab', city: 'rif dimashq' },
  { triggers: ['ببيلا', 'babila'], district: 'babila', city: 'rif dimashq' },
  { triggers: ['يلدا', 'yalda'], district: 'yalda', city: 'rif dimashq' },
  { triggers: ['معضمية الشام', 'المعضمية', 'muadamiyat'], district: 'muadamiyat al sham', city: 'rif dimashq' },
  { triggers: ['الكسوة', 'kisweh'], district: 'kisweh', city: 'rif dimashq' },
  // Rif Dimashq Low
  { triggers: ['عرطوز', 'artouz'], district: 'artouz', city: 'rif dimashq' },
  { triggers: ['صحنايا', 'sahnaya'], district: 'sahnaya', city: 'rif dimashq' },
  { triggers: ['المليحة', 'مليحة', 'mleiha'], district: 'mleiha', city: 'rif dimashq' },
  { triggers: ['حجر الأسود', 'hajar al aswad'], district: 'hajar al aswad', city: 'rif dimashq' },
  { triggers: ['مخيم اليرموك', 'اليرموك', 'yarmouk'], district: 'yarmouk camp', city: 'rif dimashq' },
  { triggers: ['مخيم جرمانا', 'jaramana camp'], district: 'jaramana camp', city: 'rif dimashq' },
  // Aleppo
  { triggers: ['العزيزية', 'عزيزية', 'aziziyeh'], district: 'aziziyeh', city: 'aleppo' },
  { triggers: ['الحمدانية', 'حمدانية', 'hamdaniyeh'], district: 'hamdaniyeh', city: 'aleppo' },
  { triggers: ['السريان', 'suryan'], district: 'suryan', city: 'aleppo' },
  { triggers: ['الفرقان', 'furqan'], district: 'furqan', city: 'aleppo' },
  { triggers: ['الشهباء', 'shahba'], district: 'shahba', city: 'aleppo' },
  { triggers: ['حلب القديمة', 'old aleppo'], district: 'old aleppo', city: 'aleppo' },
  { triggers: ['الراموسة', 'ramouseh'], district: 'ramouseh', city: 'aleppo' },
  // Homs
  { triggers: ['الوعر', 'وعر', 'al waer'], district: 'al waer', city: 'homs' },
  { triggers: ['الحميدية', 'حميدية', 'al hamidiyah'], district: 'al hamidiyah', city: 'homs' },
  { triggers: ['الزهراء حمص', 'zahraa homs'], district: 'zahraa', city: 'homs' },
  { triggers: ['عكرمة', 'akrameh'], district: 'akrameh', city: 'homs' },
  // Latakia
  { triggers: ['الزراعة لاذقية', 'ziraa latakia'], district: 'ziraa', city: 'latakia' },
  { triggers: ['الشيخ ضاهر', 'sheikh daher'], district: 'sheikh daher', city: 'latakia' },
  { triggers: ['الرمل اللاذقية', 'raml latakia'], district: 'raml south', city: 'latakia' },
  // Hama
  { triggers: ['حماة', 'hama city', 'الحاضر'], district: 'hader', city: 'hama' },
  // Daraa
  { triggers: ['درعا', 'daraa'], district: 'daraa al balad', city: 'daraa' },
  // Deir ez-Zor
  { triggers: ['دير الزور', 'ديرالزور', 'deir ez-zor'], district: 'qusour deir ez-zor', city: 'deir ez-zor' },
  { triggers: ['الميادين', 'mayadin'], district: 'mayadin', city: 'deir ez-zor' },
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
