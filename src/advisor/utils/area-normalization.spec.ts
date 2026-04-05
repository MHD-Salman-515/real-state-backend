import { normalizeAreaInput, normalizeAreaValue } from './area-normalization';

describe('area-normalization', () => {
  it('normalizes and maps common Arabic variants to canonical English keys', () => {
    const normalized = normalizeAreaInput({
      city: '  دمشق  ',
      district: '  المزه ',
      property_type: ' شقــة ',
    });

    expect(normalized).toEqual({
      city_norm: 'damascus',
      district_norm: 'mazzeh',
      property_type_norm: 'apartment',
    });
  });

  it('collapses spaces and keeps lowercase canonical English values', () => {
    expect(normalizeAreaValue('city', '  DaMaScUs   ')).toBe('damascus');
    expect(normalizeAreaValue('district', '  MAZZEH  ')).toBe('mazzeh');
    expect(normalizeAreaValue('property_type', '  APARTMENT  ')).toBe('apartment');
  });

  it('maps common short english variants for property type', () => {
    expect(normalizeAreaValue('property_type', ' apt ')).toBe('apartment');
    expect(normalizeAreaValue('property_type', 'house')).toBe('house');
    expect(normalizeAreaValue('property_type', 'أرض')).toBe('land');
  });

  it('returns normalized fallback when no alias mapping is defined', () => {
    expect(normalizeAreaValue('city', '  latakia  ')).toBe('latakia');
    expect(normalizeAreaValue('district', '  al hamra  ')).toBe('al hamra');
  });

  it('returns undefined for non-string or empty input', () => {
    expect(normalizeAreaValue('city', undefined)).toBeUndefined();
    expect(normalizeAreaValue('district', null)).toBeUndefined();
    expect(normalizeAreaValue('property_type', '   ')).toBeUndefined();
  });
});
