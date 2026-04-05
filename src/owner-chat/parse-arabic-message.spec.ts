import { parseArabicMessage } from './parse-arabic-message';

describe('parseArabicMessage', () => {
  it('parses 30-day window with Arabic digits', () => {
    expect(parseArabicMessage('اعطني ملخص آخر ٣٠ يوم').days_window).toBe(30);
  });

  it('maps mazzeh + city damascus', () => {
    const parsed = parseArabicMessage('سوق المزة للشقق');
    expect(parsed.district).toBe('mazzeh');
    expect(parsed.city).toBe('damascus');
    expect(parsed.property_type).toBe('apartment');
  });

  it('maps mashrou dummar and villas', () => {
    const parsed = parseArabicMessage('فلل مشروع دمر');
    expect(parsed.district).toBe('mashrou dummar');
    expect(parsed.property_type).toBe('villa');
    expect(parsed.city).toBe('damascus');
  });
});
