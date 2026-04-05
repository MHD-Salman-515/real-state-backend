import { ChatIntentService } from './chat-intent.service';

describe('ChatIntentService', () => {
  const makeService = (districtRows?: Array<{ district: string; city: string }>) => {
    const prisma = {
      marketData: {
        findMany: jest.fn().mockResolvedValue(
          districtRows ?? [{ district: 'المليحة', city: 'damascus' }],
        ),
      },
    };

    return {
      service: new ChatIntentService(prisma as any),
      prisma,
    };
  };

  it('detects fresh property evaluation intent for generic Arabic ask', () => {
    const { service } = makeService();
    expect(service.detectIntent('بدي تقييم عقار')).toBe('PROPERTY_EVALUATION');
  });

  it('detects market heatmap intent before legacy clarification phrases', () => {
    const { service } = makeService();
    expect(service.detectIntent('ما أفضل مناطق دمشق؟')).toBe('MARKET_HEATMAP');
    expect(service.detectIntent('أفضل مناطق الاستثمار في دمشق')).toBe('MARKET_HEATMAP');
    expect(service.detectIntent('انا عم اسال عن احوال الاسعار بدمشق اليوم')).toBe(
      'MARKET_HEATMAP',
    );
    expect(service.detectIntent('وين الاستثمار أفضل حالياً؟')).toBe('INVESTMENT_ANALYSIS');
  });

  it('detects property search for Arabic search phrasing', () => {
    const { service } = makeService([
      { district: 'المزة', city: 'damascus' },
      { district: 'ريف دمشق', city: 'damascus' },
    ]);

    expect(service.detectIntent('بدي شقق بالمزة')).toBe('PROPERTY_SEARCH');
    expect(service.detectIntent('بدور على بيت للإيجار بريف دمشق')).toBe('PROPERTY_SEARCH');
  });

  it('extracts plural apartment search and explicit mazzeh district', async () => {
    const { service } = makeService([{ district: 'المزة', city: 'damascus' }]);
    const extracted = await service.extractPropertyData('بدي شقق بالمزة');

    expect(extracted.property_type).toBe('apartment');
    expect(extracted.district).toBe('المزة');
  });

  it('extracts house search in rif dimashq correctly', async () => {
    const { service } = makeService([{ district: 'ريف دمشق', city: 'damascus' }]);
    const extracted = await service.extractPropertyData('بدور على بيت للإيجار بريف دمشق');

    expect(extracted.property_type).toBe('house');
    expect(extracted.district).toBe('ريف دمشق');
  });

  it('extracts district and area using normalized Arabic district aliases', async () => {
    const { service } = makeService([
      { district: 'المليحة', city: 'damascus' },
      { district: 'المزة', city: 'damascus' },
      { district: 'ريف دمشق', city: 'damascus' },
    ]);
    const extracted = await service.extractPropertyData(
      'عندي عقار بالمليحة مساحته 150 متر',
    );

    expect(extracted.district).toBe('المليحة');
    expect(extracted.area_m2).toBe(150);
  });

  it('extracts complete explicit property bundle from one arabic sentence', async () => {
    const { service } = makeService([{ district: 'المزة', city: 'damascus' }]);
    const extracted = await service.extractPropertyData(
      'عندي شقة بالمزة 120 متر وسعرها 135000',
    );

    expect(extracted.district).toBe('المزة');
    expect(extracted.property_type).toBe('apartment');
    expect(extracted.area_m2).toBe(120);
    expect(extracted.ask_price).toBe(135000);
  });

  it('extracts ask_price from arabic thousand format inside property context', async () => {
    const { service } = makeService();
    const extracted = await service.extractPropertyData('١٣٠ الف دولار', {
      pending_slot: 'ask_price',
      district: 'المليحة',
      property_type: 'apartment',
      area_m2: 150,
    });

    expect(extracted.ask_price).toBe(130000);
  });

  it('extracts ask_price from bare numeric text when pending ask_price', async () => {
    const { service } = makeService();
    const extracted = await service.extractPropertyData('١٣٠٠٠٠', {
      pending_slot: 'ask_price',
      district: 'المليحة',
      property_type: 'apartment',
      area_m2: 150,
    });

    expect(extracted.ask_price).toBe(130000);
  });

  it('extracts ask_price from combined arabic property sentence', async () => {
    const { service } = makeService();
    const extracted = await service.extractPropertyData(
      'شقة والمساحة ١٣٠ متر وسعر العرض ١٠ الاف دولار',
    );

    expect(extracted.property_type).toBe('apartment');
    expect(extracted.area_m2).toBe(130);
    expect(extracted.ask_price).toBe(10000);
  });
});
