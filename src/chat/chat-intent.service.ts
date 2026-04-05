import { Injectable, Logger } from '@nestjs/common';
import {
  getAreaSearchCandidates,
  normalizeAreaValue,
} from '../advisor/utils/area-normalization';
import { PrismaService } from '../prisma/prisma.service';

export type ChatAdvisorIntent =
  | 'PROPERTY_EVALUATION'
  | 'INVESTMENT_ANALYSIS'
  | 'MARKET_HEATMAP'
  | 'PROPERTY_SEARCH'
  | 'GENERAL_QUESTION';

export type ExtractedPropertyData = {
  city?: string;
  district?: string;
  property_type?: string;
  area_m2?: number;
  ask_price?: number;
  bedrooms?: number;
};

type DistrictCacheRow = {
  district: string;
  city: string;
  searchTerms: string[];
};

const DISTRICT_ALIAS_OVERRIDES: Record<string, string[]> = {
  المليحة: ['مليحة', 'المليحه', 'مليحه', 'بالمليحة', 'بالمليحه', 'almleiha', 'mleiha', 'mleha'],
  mazzeh: ['المزة', 'المزه', 'مزة', 'مزه', 'بالمزة', 'بالمزه'],
  المزة: ['المزة', 'المزه', 'مزة', 'مزه', 'بالمزة', 'بالمزه'],
  المزه: ['المزة', 'المزه', 'مزة', 'مزه', 'بالمزة', 'بالمزه'],
  القصاع: ['قصاع', 'القصاع', 'بالقصاع'],
  'ريف دمشق': ['ريف دمشق', 'بريف دمشق', 'ريف الشام'],
};

@Injectable()
export class ChatIntentService {
  private readonly logger = new Logger(ChatIntentService.name);
  private districtCache: DistrictCacheRow[] | null = null;

  constructor(private readonly prisma: PrismaService) {}

  detectIntent(message: string): ChatAdvisorIntent {
    const normalized = this.normalizeText(message);

    if (
      /(اعطيني العقارات|اعرض العقارات|اعرضلي عقارات|عقارات بدمشق|عقارات في دمشق|العقارات اللي|شو في عقارات|في عقارات|بدور على|ابحث عن|أبحث عن|ابحثلي عن|دورلي على|looking for|show me properties|properties in|find properties|list properties)/i.test(
        normalized,
      )
    ) {
      return 'PROPERTY_SEARCH';
    }

    if (
      /(هل هذا استثمار جيد|هل هاد استثمار جيد|هل هذه صفقة|هل هاد صفقة|هل هي صفقة|هل تنصح بشراء هذا العقار|استثمار جيد|صفقة|investment|good investment|worth buying|تنصح بشرائه|تنصح بشراءه|تنصح اشتريه|تنصح أشتريه|مناسب للاستثمار|مناسبه للاستثمار|وين الاستثمار أفضل|اين الاستثمار أفضل|أفضل استثمار حالياً|افضل استثمار حاليا)/i.test(
        normalized,
      )
    ) {
      return 'INVESTMENT_ANALYSIS';
    }

    if (
      /(هل السعر مناسب|هل العقار غالي|قيم هذا العقار|قي[ّم|م] هذا العقار|سعرها مناسب|كم سعره|كم سعرها|قيم العقار|بدي تقييم عقار|بدي تقييم للعقار|اريد تقييم عقار|أريد تقييم عقار|overpriced|fair price|evaluate this property|property evaluation)/i.test(
        normalized,
      )
    ) {
      return 'PROPERTY_EVALUATION';
    }

    if (
      /(ما افضل منطقة للاستثمار|ما أفضل منطقة للاستثمار|ما افضل مناطق دمشق|ما أفضل مناطق دمشق|ما اغلى الاحياء|ما أغلى الأحياء|اغلى الاحياء في دمشق|أغلى الأحياء في دمشق|افضل مناطق دمشق|أفضل مناطق دمشق|أفضل مناطق الاستثمار|افضل مناطق الاستثمار|أفضل منطقة للاستثمار في دمشق|افضل منطقة للاستثمار في دمشق|ما افضل المناطق|ما أفضل المناطق|شو خطة السوق اليوم|كيف السوق اليوم|شو وضع السوق|ملخص السوق|خطة السوق|احكيلي عن سوق|احكيلي عن سوق دمشق|احكيلي عن سوق العقارات|سوق دمشق|سوق العقارات|سوق .* اليوم|وضع السوق|احوال الاسعار|أحوال الأسعار|اسعار العقارات|أسعار العقارات|كيف السوق بدمشق|شو وضع السوق بدمشق|best areas|best districts|heatmap|اغلى منطقة|أغلى منطقة|undervalued|اقل المناطق سعرا|أرخص المناطق)/i.test(
        normalized,
      )
    ) {
      return 'MARKET_HEATMAP';
    }

    return 'GENERAL_QUESTION';
  }

  async extractPropertyData(
    message: string,
    fallback?: Record<string, unknown> | null,
  ): Promise<ExtractedPropertyData> {
    const normalized = this.normalizeText(message);
    const districtMatch = await this.detectDistrictAndCity(normalized);
    const propertyType = this.detectPropertyType(normalized) ?? this.toOptionalString(fallback?.property_type);
    const area = this.extractArea(normalized) ?? this.toPositiveNumber(fallback?.area_m2);
    const askPrice = this.extractAskPrice(normalized, fallback);
    const bedrooms = this.extractBedrooms(normalized);
    const fallbackCity = this.toOptionalString(fallback?.city);
    const fallbackDistrict = this.toOptionalString(fallback?.district);

    return {
      city: districtMatch?.city || this.detectCity(normalized) || fallbackCity,
      district: districtMatch?.district || fallbackDistrict,
      property_type: propertyType,
      area_m2: area,
      ask_price: askPrice,
      bedrooms,
    };
  }

  hasPropertySignal(message: string): boolean {
    const normalized = this.normalizeText(message);
    return Boolean(
      this.detectPropertyType(normalized) ||
        this.detectCity(normalized) ||
        this.extractArea(normalized) ||
        this.extractAskPrice(normalized) ||
        this.extractBedrooms(normalized) ||
        /(عقار|شقة|فيلا|منزل|بيت|ارض|أرض|property|apartment|villa|house|land|district|منطقة|حي)/i.test(
          normalized,
        ),
    );
  }

  private async detectDistrictAndCity(
    normalizedMessage: string,
  ): Promise<DistrictCacheRow | null> {
    const districts = await this.getDistrictCache();
    for (const row of districts) {
      if (row.searchTerms.some((term) => term && normalizedMessage.includes(term))) {
        return row;
      }
    }
    return null;
  }

  private async getDistrictCache(): Promise<DistrictCacheRow[]> {
    if (this.districtCache) {
      return this.districtCache;
    }

    const rows = await this.prisma.marketData.findMany({
      where: {
        district: { not: null },
        city: { not: null },
      },
      select: {
        district: true,
        city: true,
      },
      distinct: ['district'],
      take: 1000,
    });

    this.districtCache = rows
      .filter(
        (row): row is { district: string; city: string } =>
          typeof row.district === 'string' &&
          row.district.trim().length > 0 &&
          typeof row.city === 'string' &&
          row.city.trim().length > 0,
      )
      .map((row) => ({
        district: row.district,
        city: row.city,
        searchTerms: this.buildDistrictSearchTerms(row.district),
      }))
      .sort(
        (a, b) =>
          Math.max(...b.searchTerms.map((term) => term.length)) -
          Math.max(...a.searchTerms.map((term) => term.length)),
      );

    return this.districtCache;
  }

  private buildDistrictSearchTerms(district: string): string[] {
    const normalizedDistrict = this.normalizeText(district);
    const overrideAliases =
      DISTRICT_ALIAS_OVERRIDES[district] ??
      DISTRICT_ALIAS_OVERRIDES[normalizedDistrict] ??
      [];

    return Array.from(
      new Set(
        [
          normalizedDistrict,
          ...overrideAliases.map((item) => this.normalizeText(item)),
          ...getAreaSearchCandidates('district', district).map((item) =>
            this.normalizeText(item),
          ),
        ].filter(Boolean),
      ),
    );
  }

  private detectPropertyType(message: string): string | undefined {
    if (/(مكتب|office)/i.test(message)) return 'office';
    if (/(محل|shop|store)/i.test(message)) return 'shop';
    if (/(فيلا|villa)/i.test(message)) return 'villa';
    if (/(منزل|بيت|بيوت|house|home)/i.test(message)) return 'house';
    if (/(ارض|أرض|land|plot)/i.test(message)) return 'land';
    if (/(استوديو|studio)/i.test(message)) return 'studio';
    if (/(شقة|شقق|apartment|apt)/i.test(message)) return 'apartment';
    return undefined;
  }

  private detectCity(message: string): string | undefined {
    const normalizedCity = normalizeAreaValue('city', message);
    if (normalizedCity === 'damascus') return 'damascus';
    if (normalizedCity === 'rif dimashq') return 'rif dimashq';
    if (/(دمشق|damascus|الشام)/i.test(message)) return 'damascus';
    if (/(ريف دمشق|rif dimashq|rural damascus)/i.test(message)) return 'rif dimashq';
    if (/(حلب|aleppo)/i.test(message)) return 'aleppo';
    if (/(حمص|homs)/i.test(message)) return 'homs';
    return undefined;
  }

  private extractArea(message: string): number | undefined {
    const patterns = [
      /\b(\d+(?:\.\d+)?)\s*(?:m2|sqm|sq m|متر مربع|متر|م²|m)\b/i,
      /(مساحة|على مساحة)\s*(\d+(?:\.\d+)?)\b/i,
      /مساحت(?:ه|ها)?\s*(\d+(?:\.\d+)?)\s*(?:متر مربع|متر|م²|m2|m)?/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (!match) continue;
      const value = Number(match[2] ?? match[1]);
      if (Number.isFinite(value) && value > 10 && value < 10000) {
        return value;
      }
    }

    return undefined;
  }

  private extractAskPrice(
    message: string,
    fallback?: Record<string, unknown> | null,
  ): number | undefined {
    const pendingSlot = this.toOptionalString(fallback?.pending_slot);
    const propertyThreadContext = Boolean(
      pendingSlot === 'ask_price' ||
        this.toOptionalString(fallback?.district) ||
        this.toOptionalString(fallback?.city) ||
        this.toOptionalString(fallback?.property_type) ||
        this.toPositiveNumber(fallback?.area_m2),
    );
    const priceHint =
      /(?:سعرها|سعره|السعر|سعر|price|asking price|دولار|\$|usd|الف|ألف|k|thousand)/i.test(
        message,
      ) || pendingSlot === 'ask_price';

    const thousandBased = message.match(
      /\b(\d+(?:\.\d+)?)\s*(?:k|thousand)\b|(\d+(?:\.\d+)?)\s*(?:الاف|آلاف|الافا|الف|ألف)(?:\s*دولار)?/i,
    );
    if (thousandBased) {
      const raw = Number(thousandBased[1] ?? thousandBased[2]);
      if (Number.isFinite(raw) && raw > 0) {
        const extracted = Math.round(raw * 1000);
        this.logger.log(
          `OLLAMA_ORCHESTRATOR_SLOTS ask_price_extracted_from_phrase=${extracted}`,
        );
        return extracted;
      }
    }

    const arabicWordThousands = this.extractArabicWordThousands(message);
    if (arabicWordThousands) {
      this.logger.log(
        `OLLAMA_ORCHESTRATOR_SLOTS ask_price_extracted_from_phrase=${arabicWordThousands}`,
      );
      return arabicWordThousands;
    }

    const explicit =
      message.match(
        /(?:سعر العرض|سعرها|سعره|السعر|سعر|price|asking price|ب)\s*(?:هو|=|:)?\s*(\d[\d.,]*)\s*(?:\$|usd|دولار)?/i,
      ) || message.match(/\b(\d[\d.,]{3,})\s*(?:\$|usd|دولار)\b/i);

    if (explicit?.[1]) {
      const parsed = Number(explicit[1].replace(/[,\s]/g, ''));
      if (Number.isFinite(parsed) && parsed > 1000) {
        this.logger.log(
          `OLLAMA_ORCHESTRATOR_SLOTS ask_price_extracted_from_phrase=${parsed}`,
        );
        return parsed;
      }
    }

    if (propertyThreadContext || priceHint) {
      const bare = message.match(/\b(\d[\d.,]{3,})\b/);
      if (bare?.[1]) {
        const parsed = Number(bare[1].replace(/[,\s]/g, ''));
        if (Number.isFinite(parsed) && parsed > 1000) {
          this.logger.log(
            `OLLAMA_ORCHESTRATOR_SLOTS ask_price_extracted_from_phrase=${parsed}`,
          );
          return parsed;
        }
      }
    }

    return undefined;
  }

  private extractBedrooms(message: string): number | undefined {
    const match = message.match(/(\d+(?:\.0+)?)\s*(?:غرف|غرفة|bedrooms?|beds?|br)\b/i);
    if (!match) {
      return undefined;
    }

    const parsed = Number(match[1]);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 20) {
      return undefined;
    }

    return parsed;
  }

  private normalizeText(value: string): string {
    return String(value || '')
      .toLowerCase()
      .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private toPositiveNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return undefined;
    }
    return parsed;
  }

  private extractArabicWordThousands(message: string): number | undefined {
    const normalized = this.normalizeText(message);
    const wordBased = normalized.match(
      /(?:سعر العرض|السعر|سعرها|سعره|سعر|ب)?\s*(?:هو|=|:)?\s*(عشره|عشرة|احدعش|احدى عشر|اثنعش|اثنا عشر|اثني عشر|ثلاثه عشر|ثلاثة عشر|اربعه عشر|اربعة عشر|خمسه عشر|خمسة عشر|سته عشر|ستة عشر|سبعه عشر|سبعة عشر|ثمانيه عشر|ثمانية عشر|تسعه عشر|تسعة عشر|عشرين)\s*(?:الاف|آلاف|الف|ألف)(?:\s*دولار)?/,
    );
    const word = wordBased?.[1];
    if (!word) return undefined;

    const wordToNumber: Record<string, number> = {
      عشره: 10,
      عشرة: 10,
      احدعش: 11,
      'احدى عشر': 11,
      'اثنعش': 12,
      'اثنا عشر': 12,
      'اثني عشر': 12,
      'ثلاثه عشر': 13,
      'ثلاثة عشر': 13,
      'اربعه عشر': 14,
      'اربعة عشر': 14,
      'خمسه عشر': 15,
      'خمسة عشر': 15,
      'سته عشر': 16,
      'ستة عشر': 16,
      'سبعه عشر': 17,
      'سبعة عشر': 17,
      'ثمانيه عشر': 18,
      'ثمانية عشر': 18,
      'تسعه عشر': 19,
      'تسعة عشر': 19,
      'عشرين': 20,
    };
    const multiplier = wordToNumber[word];
    if (!multiplier) return undefined;
    return multiplier * 1000;
  }
}
