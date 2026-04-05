export type OwnerChatIntent =
  | 'PROPERTY_STRATEGY'
  | 'SUGGESTIONS_QUEUE'
  | 'PORTFOLIO'
  | 'MARKET_WATCH_INSIGHTS'
  | 'AI_HISTORY'
  | 'SELLER_PRICE'
  | 'BUYER_EVALUATE'
  | 'SMALL_TALK'
  | 'FALLBACK';

export function detectOwnerChatIntent(params: {
  message: string;
  contextPropertyId?: number;
}): OwnerChatIntent {
  const text = normalizeText(params.message);

  if (matches(text, [/مهام/i, /مهامي/i, /\bto-?do\b/i])) {
    return 'SUGGESTIONS_QUEUE';
  }

  if (matches(text, [/محفظتي/i, /\bportfolio\b/i])) {
    return 'PORTFOLIO';
  }

  if (matches(text, [/سجل/i, /\bhistory\b/i, /سجل\s*urbanex/i])) {
    return 'AI_HISTORY';
  }

  if (
    matches(text, [
      /مراقبة السوق/i,
      /\binsights\b/i,
      /ترند/i,
      /تقلب/i,
      /\btrend\b/i,
      /\bvolatility\b/i,
      /\bmarket insights\b/i,
    ])
  ) {
    return 'MARKET_WATCH_INSIGHTS';
  }

  if (
    params.contextPropertyId &&
    matches(text, [
      /\bstrategy\b/i,
      /قي[ّ]?م/i,
      /سعر عقار/i,
      /تسعير/i,
      /اقترح سعر/i,
      /سعر/i,
    ])
  ) {
    return 'PROPERTY_STRATEGY';
  }

  return 'FALLBACK';
}

function matches(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function normalizeText(value: string): string {
  return String(value || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .toLowerCase()
    .trim();
}
