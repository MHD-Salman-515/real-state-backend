import { MarketDataImportDiagnosticsService } from './market-data-import-diagnostics.service';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MarketDataService } = require('./market-data.service');

describe('MarketDataService parsing helpers', () => {
  const service = new MarketDataService(
    {} as never,
    new MarketDataImportDiagnosticsService(),
  ) as unknown as {
    extractAreaM2FromText: (value: string) => number | null;
    parseNullableInteger: (value: string) => number | null;
    extractBedroomsFromText: (value: string) => number | null;
  };

  it('extracts area from mixed Arabic listing text', () => {
    expect(
      service.extractAreaM2FromText(
        'للبيع : شقة في السبع بحرات ، 146m , طابو اخضر',
      ),
    ).toBe(146);
  });

  it('extracts area from explicit metric patterns', () => {
    expect(service.extractAreaM2FromText('شقة 140 m2')).toBe(140);
    expect(service.extractAreaM2FromText('مساحة 165 متر')).toBe(165);
  });

  it('parses bedrooms decimals ending in .0 safely', () => {
    expect(service.parseNullableInteger('2.0')).toBe(2);
    expect(service.parseNullableInteger('3')).toBe(3);
  });

  it('extracts bedrooms from title text', () => {
    expect(service.extractBedroomsFromText('شقة 3 غرف')).toBe(3);
  });
});
