import { createHash } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  InvalidBreakdown,
  InvalidImportRowReport,
  MarketDataImportDiagnosticsService,
} from './market-data-import-diagnostics.service';

type ParsedCsvRow = {
  rowIndex: number;
  raw: Record<string, string>;
  property_id: string;
  source: string;
  phone: string;
  title: string;
  title_normalized: string;
  city: string;
  district: string;
  location_raw: string;
  area_m2: string;
  bedrooms: string;
  price_usd: string;
  price_raw: string;
  price_per_m2: string;
  property_type: string;
  luxury_level: string;
  price_category: string;
  market_segment: string;
  image_count: string;
  no_image_note: string;
  image_url: string;
  image_1: string;
  image_2: string;
  image_3: string;
  image_4: string;
  image_5: string;
  image_6: string;
  has_image: string;
  missing_price_flag: string;
  missing_area_flag: string;
  missing_bedrooms_flag: string;
  url: string;
};

type PreparedRowResult =
  | {
      ok: true;
      row: PreparedMarketDataRow;
    }
  | {
      ok: false;
      report: InvalidImportRowReport;
    };

type ImportCsvResult = {
  success: true;
  inserted: number;
  skipped: number;
  duplicates: number;
  invalid: number;
  invalid_breakdown: InvalidBreakdown;
  sample_invalid_rows: InvalidImportRowReport[];
};

type CsvParseResult = {
  rows: ParsedCsvRow[];
  parsingFailures: InvalidImportRowReport[];
};

type PreparedMarketDataRow = {
  external_property_id: string | null;
  source_name: string | null;
  phone: string | null;
  title: string | null;
  title_normalized: string | null;
  city: string;
  district: string;
  location_raw: string | null;
  area_m2: number;
  bedrooms: number | null;
  price_usd: number;
  price_raw: string | null;
  price_per_m2: number | null;
  property_type: string | null;
  luxury_level: string | null;
  price_category: string | null;
  market_segment: string | null;
  image_count: number | null;
  no_image_note: string | null;
  image_url: string | null;
  image_1: string | null;
  image_2: string | null;
  image_3: string | null;
  image_4: string | null;
  image_5: string | null;
  image_6: string | null;
  has_image: boolean | null;
  missing_price_flag: boolean | null;
  missing_area_flag: boolean | null;
  missing_bedrooms_flag: boolean | null;
  source_url: string | null;
  source: 'csv_import';
  ingest_hash: string;
  raw_json: Record<string, unknown>;
  is_outlier: boolean;
};

@Injectable()
export class MarketDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly diagnostics: MarketDataImportDiagnosticsService,
  ) {}

  async importCsv(params: {
    fileBuffer: Buffer;
  }): Promise<ImportCsvResult> {
    const csvContent = params.fileBuffer.toString('utf-8');
    const { rows: parsedRows, parsingFailures } = this.parseCsv(csvContent);

    if (parsedRows.length === 0 && parsingFailures.length === 0) {
      throw new BadRequestException('CSV file has no data rows');
    }

    const preparedRows: PreparedMarketDataRow[] = [];
    const invalidReports: InvalidImportRowReport[] = [...parsingFailures];

    for (const row of parsedRows) {
      const prepared = this.prepareRow(row);
      if ('row' in prepared) {
        preparedRows.push(prepared.row);
        continue;
      }
      invalidReports.push(prepared.report);
    }

    const uniqueRows = new Map<string, PreparedMarketDataRow>();
    let duplicateRowsInsideFile = 0;
    for (const row of preparedRows) {
      if (uniqueRows.has(row.ingest_hash)) {
        duplicateRowsInsideFile += 1;
        continue;
      }
      uniqueRows.set(row.ingest_hash, row);
    }

    const dedupedRows = Array.from(uniqueRows.values());
    const existingHashes = dedupedRows.length
      ? await this.findExistingHashes(dedupedRows.map((row) => row.ingest_hash))
      : new Set<string>();

    const rowsToInsert = dedupedRows.filter((row) => !existingHashes.has(row.ingest_hash));
    const duplicates = duplicateRowsInsideFile + existingHashes.size;
    const inserted = await this.insertRows(rowsToInsert);
    const invalid = invalidReports.length;

    return {
      success: true,
      inserted,
      skipped: duplicates + invalid,
      duplicates,
      invalid,
      invalid_breakdown: this.diagnostics.buildBreakdown(invalidReports),
      sample_invalid_rows: invalidReports.slice(0, 10),
    };
  }

  private async findExistingHashes(hashes: string[]): Promise<Set<string>> {
    const rows = await this.prisma.marketData.findMany({
      where: {
        ingest_hash: {
          in: hashes,
        },
      },
      select: {
        ingest_hash: true,
      },
    });

    return new Set(
      rows
        .map((row) => String(row.ingest_hash || '').trim())
        .filter((value) => value.length > 0),
    );
  }

  private async insertRows(rows: PreparedMarketDataRow[]): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }

    let inserted = 0;
    const chunkSize = 500;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const batch = rows.slice(i, i + chunkSize);
      const result = await this.prisma.marketData.createMany({
        data: batch.map((row) => ({
          ...row,
          raw_json: row.raw_json as Prisma.InputJsonObject,
        })),
        skipDuplicates: true,
      });
      inserted += result.count;
    }

    return inserted;
  }

  private prepareRow(row: ParsedCsvRow): PreparedRowResult {
    const locationText = this.cleanString(row.location_raw);
    const titleText = this.cleanString(row.title);
    const titleNormalizedText = this.cleanString(row.title_normalized);
    const recoveredLocation = this.recoverLocation({
      city: row.city,
      district: row.district,
      location_raw: row.location_raw,
      title: row.title,
      title_normalized: row.title_normalized,
    });
    const recoveredPriceUsd = this.parseNullablePositiveNumber(row.price_usd)
      ?? this.parsePriceUsdFromRaw(row.price_raw);
    const recoveredAreaM2 = this.parseNullablePositiveNumber(row.area_m2)
      ?? this.extractAreaM2FromText(locationText)
      ?? this.extractAreaM2FromText(titleText)
      ?? this.extractAreaM2FromText(titleNormalizedText);
    const recoveredBedrooms = this.parseNullableInteger(row.bedrooms)
      ?? this.extractBedroomsFromText(titleText)
      ?? this.extractBedroomsFromText(titleNormalizedText);

    const cleaned = {
      property_id: this.cleanString(row.property_id),
      source_name: this.cleanString(row.source),
      phone: this.cleanString(row.phone),
      title: titleText,
      title_normalized: titleNormalizedText,
      city: recoveredLocation.city,
      district: recoveredLocation.district,
      location_raw: locationText,
      area_m2: recoveredAreaM2,
      bedrooms: recoveredBedrooms,
      price_usd: recoveredPriceUsd,
      price_raw: this.cleanString(row.price_raw),
      price_per_m2: this.parseNullablePositiveNumber(row.price_per_m2),
      property_type: this.cleanString(row.property_type),
      luxury_level: this.cleanString(row.luxury_level),
      price_category: this.cleanString(row.price_category),
      market_segment: this.cleanString(row.market_segment),
      image_count: this.parseNullableInteger(row.image_count),
      no_image_note: this.cleanString(row.no_image_note),
      image_url: this.cleanString(row.image_url),
      image_1: this.cleanString(row.image_1),
      image_2: this.cleanString(row.image_2),
      image_3: this.cleanString(row.image_3),
      image_4: this.cleanString(row.image_4),
      image_5: this.cleanString(row.image_5),
      image_6: this.cleanString(row.image_6),
      has_image: this.parseNullableBoolean(row.has_image),
      missing_price_flag: this.parseNullableBoolean(row.missing_price_flag),
      missing_area_flag: this.parseNullableBoolean(row.missing_area_flag),
      missing_bedrooms_flag: this.parseNullableBoolean(row.missing_bedrooms_flag),
      source_url: this.cleanString(row.url),
    };

    const missingCity = !this.cleanString(row.city) && !cleaned.city;
    const missingDistrict = !this.cleanString(row.district) && !cleaned.district;
    const missingPriceUsd = !this.cleanString(row.price_usd) && !this.cleanString(row.price_raw);
    const invalidPriceUsd =
      !missingPriceUsd && (cleaned.price_usd == null || cleaned.price_usd <= 0);
    const missingAreaM2 = !this.cleanString(row.area_m2) && recoveredAreaM2 == null;
    const invalidAreaM2 =
      !missingAreaM2 && (cleaned.area_m2 == null || cleaned.area_m2 <= 0);

    if (
      missingCity ||
      missingDistrict ||
      missingPriceUsd ||
      invalidPriceUsd ||
      missingAreaM2 ||
      invalidAreaM2
    ) {
      return {
        ok: false,
        report: this.diagnostics.classifyInvalidRow({
          rowIndex: row.rowIndex,
          raw: row.raw,
          parsed_values: {
            city: cleaned.city,
            district: cleaned.district,
            area_m2: cleaned.area_m2,
            bedrooms: cleaned.bedrooms,
            price_usd: cleaned.price_usd,
            price_per_m2: cleaned.price_per_m2,
            recovered_from_location: recoveredLocation.recovered_from_location,
          },
          missing_city: missingCity,
          missing_district: missingDistrict,
          missing_price_usd: missingPriceUsd,
          invalid_price_usd: invalidPriceUsd,
          missing_area_m2: missingAreaM2,
          invalid_area_m2: invalidAreaM2,
        }),
      };
    }

    const safeCity = cleaned.city as string;
    const safeDistrict = cleaned.district as string;
    const safeAreaM2 = cleaned.area_m2 as number;
    const safePriceUsd = cleaned.price_usd as number;

    const ingestHash = this.buildIngestHash({
      city: safeCity,
      district: safeDistrict,
      title: cleaned.title || '',
      price_usd: safePriceUsd,
      area_m2: safeAreaM2,
      bedrooms: cleaned.bedrooms,
    });

    return {
      ok: true,
      row: {
        external_property_id: cleaned.property_id || null,
        source_name: cleaned.source_name || null,
        phone: cleaned.phone || null,
        title: cleaned.title || null,
        title_normalized: cleaned.title_normalized || null,
        city: safeCity,
        district: safeDistrict,
        location_raw: cleaned.location_raw || null,
        area_m2: safeAreaM2,
        bedrooms: cleaned.bedrooms,
        price_usd: safePriceUsd,
        price_raw: cleaned.price_raw || null,
        price_per_m2: cleaned.price_per_m2,
        property_type: cleaned.property_type || null,
        luxury_level: cleaned.luxury_level || null,
        price_category: cleaned.price_category || null,
        market_segment: cleaned.market_segment || null,
        image_count: cleaned.image_count,
        no_image_note: cleaned.no_image_note || null,
        image_url: cleaned.image_url || null,
        image_1: cleaned.image_1 || null,
        image_2: cleaned.image_2 || null,
        image_3: cleaned.image_3 || null,
        image_4: cleaned.image_4 || null,
        image_5: cleaned.image_5 || null,
        image_6: cleaned.image_6 || null,
        has_image: cleaned.has_image,
        missing_price_flag: cleaned.missing_price_flag,
        missing_area_flag: cleaned.missing_area_flag,
        missing_bedrooms_flag: cleaned.missing_bedrooms_flag,
        source_url: cleaned.source_url || null,
        source: 'csv_import',
        ingest_hash: ingestHash,
        raw_json: row.raw,
        is_outlier: false,
      },
    };
  }

  private parseCsv(content: string): CsvParseResult {
    const lines = content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      return {
        rows: [],
        parsingFailures: [],
      };
    }

    const headers = this.parseCsvLine(lines[0]).map((value) => this.normalizeHeader(value));
    const rows: ParsedCsvRow[] = [];
    const parsingFailures: InvalidImportRowReport[] = [];

    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      const values = this.parseCsvLine(line);
      if (this.hasUnbalancedQuotes(line) || values.length !== headers.length) {
        parsingFailures.push(
          this.diagnostics.classifyInvalidRow({
            rowIndex: i + 1,
            raw: { __line__: line },
            parsing_failure: true,
          }),
        );
        continue;
      }
      const raw = Object.fromEntries(
        headers.map((header, idx) => [header, String(values[idx] ?? '').trim()]),
      );

      rows.push({
        rowIndex: i + 1,
        raw,
        property_id: this.pickValue(raw, ['property_id']),
        source: this.pickValue(raw, ['source']),
        phone: this.pickValue(raw, ['phone']),
        title: this.pickValue(raw, ['title']),
        title_normalized: this.pickValue(raw, ['title_normalized']),
        city: this.pickValue(raw, ['city']),
        district: this.pickValue(raw, ['district']),
        location_raw: this.pickValue(raw, ['location_raw']),
        area_m2: this.pickValue(raw, ['area_m2']),
        bedrooms: this.pickValue(raw, ['bedrooms']),
        price_usd: this.pickValue(raw, ['price_usd']),
        price_raw: this.pickValue(raw, ['price_raw']),
        price_per_m2: this.pickValue(raw, ['price_per_m2']),
        property_type: this.pickValue(raw, ['property_type']),
        luxury_level: this.pickValue(raw, ['luxury_level']),
        price_category: this.pickValue(raw, ['price_category']),
        market_segment: this.pickValue(raw, ['market_segment']),
        image_count: this.pickValue(raw, ['image_count']),
        no_image_note: this.pickValue(raw, ['no_image_note']),
        image_url: this.pickValue(raw, ['image_url']),
        image_1: this.pickValue(raw, ['image_1']),
        image_2: this.pickValue(raw, ['image_2']),
        image_3: this.pickValue(raw, ['image_3']),
        image_4: this.pickValue(raw, ['image_4']),
        image_5: this.pickValue(raw, ['image_5']),
        image_6: this.pickValue(raw, ['image_6']),
        has_image: this.pickValue(raw, ['has_image']),
        missing_price_flag: this.pickValue(raw, ['missing_price_flag']),
        missing_area_flag: this.pickValue(raw, ['missing_area_flag']),
        missing_bedrooms_flag: this.pickValue(raw, ['missing_bedrooms_flag']),
        url: this.pickValue(raw, ['url']),
      });
    }

    return {
      rows,
      parsingFailures,
    };
  }

  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];

      if (char === '"') {
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }

      if (char === ',' && !inQuotes) {
        fields.push(current);
        current = '';
        continue;
      }

      current += char;
    }

    fields.push(current);
    return fields;
  }

  private hasUnbalancedQuotes(line: string): boolean {
    let quoteCount = 0;
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] === '"') {
        const next = line[i + 1];
        if (next === '"') {
          i += 1;
          continue;
        }
        quoteCount += 1;
      }
    }

    return quoteCount % 2 !== 0;
  }

  private normalizeHeader(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '_');
  }

  private pickValue(row: Record<string, string>, aliases: string[]): string {
    for (const alias of aliases) {
      const value = row[alias];
      if (value != null) {
        return value;
      }
    }
    return '';
  }

  private cleanString(value: string | null | undefined): string | undefined {
    const normalized = String(value || '').trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private parseNullablePositiveNumber(value: string | null | undefined): number | null {
    const cleaned = this.cleanString(value);
    if (!cleaned) {
      return null;
    }

    const normalized = this.normalizeNumericText(cleaned).replace(/[^0-9.\-]/g, '');
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  private parseNullableInteger(value: string | null | undefined): number | null {
    const cleaned = this.cleanString(value);
    if (!cleaned) {
      return null;
    }

    const normalized = this.normalizeText(cleaned).replace(/[،,\s]/g, '');
    if (!/^-?\d+(?:\.0+)?$/.test(normalized)) {
      return null;
    }

    const parsed = Number(normalized);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  private parsePriceUsdFromRaw(value: string | null | undefined): number | null {
    const cleaned = this.cleanString(value);
    if (!cleaned) {
      return null;
    }

    return this.parseNullablePositiveNumber(cleaned);
  }

  private extractAreaM2FromText(value: string | null | undefined): number | null {
    const cleaned = this.cleanString(value);
    if (!cleaned) {
      return null;
    }

    const normalized = this.normalizeText(cleaned).toLowerCase();
    const explicitUnitMatch = normalized.match(
      /\b(\d+(?:\.\d+)?)\s*(?:m2|sqm|sq m|م2|م²|متر مربع|متر|m)\b/i,
    );
    if (explicitUnitMatch) {
      return this.parseNullablePositiveNumber(explicitUnitMatch[1]);
    }

    const prefixedMatch = normalized.match(
      /(مساحة|على مساحة)\s*(\d+(?:\.\d+)?)\s*(?:m2|sqm|sq m|م2|م²|متر مربع|متر|m)?\b/i,
    );
    if (prefixedMatch) {
      return this.parseNullablePositiveNumber(prefixedMatch[2]);
    }

    return null;
  }

  private extractBedroomsFromText(value: string | null | undefined): number | null {
    const cleaned = this.cleanString(value);
    if (!cleaned) {
      return null;
    }

    const normalized = this.normalizeText(cleaned);
    const directMatch = normalized.match(
      /(\d+)\s*(bed|beds|bedroom|bedrooms|br|غرف|غرفة|نوم)/i,
    );
    if (directMatch) {
      return this.parseNullableInteger(directMatch[1]);
    }

    if (/(studio|استوديو)/i.test(normalized)) {
      return 0;
    }

    return null;
  }

  private parseNullableBoolean(value: string | null | undefined): boolean | null {
    const cleaned = this.cleanString(value);
    if (!cleaned) {
      return null;
    }

    const normalized = cleaned.toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n'].includes(normalized)) {
      return false;
    }

    return null;
  }

  private recoverLocation(params: {
    city: string;
    district: string;
    location_raw: string;
    title: string;
    title_normalized: string;
  }): {
    city?: string;
    district?: string;
    recovered_from_location: boolean;
  } {
    const city = this.cleanString(params.city)?.toLowerCase();
    const district = this.cleanString(params.district)?.toLowerCase();
    if (city && district) {
      return {
        city,
        district,
        recovered_from_location: false,
      };
    }

    const candidates = [
      this.cleanString(params.location_raw),
      this.cleanString(params.title),
      this.cleanString(params.title_normalized),
    ].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
      const recovered = this.extractCityDistrict(candidate);
      if (!recovered.city && !recovered.district) {
        continue;
      }

      return {
        city: city || recovered.city,
        district: district || recovered.district,
        recovered_from_location: true,
      };
    }

    return {
      city,
      district,
      recovered_from_location: false,
    };
  }

  private extractCityDistrict(value: string): { city?: string; district?: string } {
    const normalized = this.normalizeText(value).toLowerCase();
    const parts = normalized
      .split(/[|,/\\-]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    const cityKeywords = [
      'damascus',
      'دمشق',
      'aleppo',
      'حلب',
      'homs',
      'حمص',
      'latakia',
      'اللاذقية',
      'tartus',
      'طرطوس',
    ];

    let city: string | undefined;
    let district: string | undefined;

    for (const part of parts) {
      if (!city && cityKeywords.some((keyword) => part.includes(keyword))) {
        city = part;
        continue;
      }

      if (!district && /[a-z\u0600-\u06ff]/i.test(part) && !/\d/.test(part)) {
        district = part;
      }
    }

    if (!city && parts.length >= 2) {
      city = parts[0];
      district = district || parts[1];
    } else if (!district && parts.length >= 1) {
      district = parts[0];
    }

    return {
      city: city?.trim().toLowerCase(),
      district: district?.trim().toLowerCase(),
    };
  }

  private normalizeNumericText(value: string): string {
    return this.normalizeText(value)
      .replace(/[،,]/g, '')
      .replace(/\s+/g, '');
  }

  private normalizeText(value: string): string {
    return value
      .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  }

  private stableNumberString(value: number): string {
    if (Number.isInteger(value)) {
      return String(value);
    }
    return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }

  private buildIngestHash(params: {
    city: string;
    district: string;
    title: string;
    price_usd: number;
    area_m2: number;
    bedrooms: number | null;
  }): string {
    const payload = [
      params.city,
      params.district,
      params.title.trim(),
      this.stableNumberString(params.price_usd),
      this.stableNumberString(params.area_m2),
      params.bedrooms == null ? '' : String(params.bedrooms),
    ].join('|');

    return createHash('sha256').update(payload).digest('hex');
  }
}
