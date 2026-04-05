interface AreaAliasMaps {
  city: Record<string, string>;
  district: Record<string, string>;
  property_type: Record<string, string>;
}

type AreaAliasConfig = Record<AreaField, Record<string, string[]>>;

const ARABIC_DIACRITICS_REGEX = /[\u064B-\u065F\u0670]/g;

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeArabicLetters(value: string): string {
  return value
    .replace(/\u0640/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(ARABIC_DIACRITICS_REGEX, '');
}

function baseNormalize(value: string): string {
  const lowered = collapseSpaces(value).toLowerCase();
  return collapseSpaces(normalizeArabicLetters(lowered));
}

function createAliasLookup(aliases: Record<string, string[]>): Record<string, string> {
  const lookup: Record<string, string> = {};
  for (const [canonical, variants] of Object.entries(aliases)) {
    for (const variant of variants) {
      lookup[baseNormalize(variant)] = canonical;
    }
    lookup[baseNormalize(canonical)] = canonical;
  }
  return lookup;
}

const aliasConfig: AreaAliasConfig = {
  city: {
    damascus: ['دمشق', 'دمشق ', 'الشام', 'dimashq', 'damas', 'damascus'],
  },
  district: {
    mazzeh: ['المزة', 'المزه', 'مزة', 'مزه', 'mazzeh', 'mazze', 'mezzeh', 'mezze'],
  },
  property_type: {
    apartment: ['شقة', 'شقه', 'شقق', 'apart', 'apt', 'apartment'],
    house: ['بيت', 'منزل', 'دار', 'house', 'home'],
    villa: ['فيلا', 'فلة', 'villa'],
    studio: ['استديو', 'ستوديو', 'studio'],
    land: ['ارض', 'أرض', 'land', 'plot'],
  },
};

const aliasMaps: AreaAliasMaps = {
  city: createAliasLookup(aliasConfig.city),
  district: createAliasLookup(aliasConfig.district),
  property_type: createAliasLookup(aliasConfig.property_type),
};

export type AreaField = keyof AreaAliasMaps;

export function normalizeAreaValue(
  field: AreaField,
  value: unknown,
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = baseNormalize(value);
  if (!normalized) {
    return undefined;
  }

  return aliasMaps[field][normalized] ?? normalized;
}

export function getAreaSearchCandidates(
  field: AreaField,
  value: unknown,
): string[] {
  if (typeof value !== 'string') {
    return [];
  }

  const normalized = baseNormalize(value);
  if (!normalized) {
    return [];
  }

  const canonical = aliasMaps[field][normalized] ?? normalized;
  const variants = aliasConfig[field][canonical] ?? [];

  return Array.from(
    new Set([
      normalized,
      canonical,
      ...variants.map((variant) => baseNormalize(variant)),
    ]),
  );
}

export function normalizeAreaInput(input: {
  city: unknown;
  district: unknown;
  property_type: unknown;
}): {
  city_norm?: string;
  district_norm?: string;
  property_type_norm?: string;
} {
  return {
    city_norm: normalizeAreaValue('city', input.city),
    district_norm: normalizeAreaValue('district', input.district),
    property_type_norm: normalizeAreaValue('property_type', input.property_type),
  };
}
