import { Injectable } from '@nestjs/common';

export type InvalidImportCategory =
  | 'missing_city'
  | 'missing_district'
  | 'missing_price_usd'
  | 'invalid_price_usd'
  | 'missing_area_m2'
  | 'invalid_area_m2'
  | 'parsing_failure'
  | 'multiple_missing_fields';

export type InvalidImportRowReport = {
  rowIndex: number;
  raw: Record<string, unknown>;
  rejection_reasons: InvalidImportCategory[];
  parsed_values?: Record<string, unknown>;
};

type DiagnosticInput = {
  rowIndex: number;
  raw: Record<string, unknown>;
  parsed_values?: Record<string, unknown>;
  missing_city?: boolean;
  missing_district?: boolean;
  missing_price_usd?: boolean;
  invalid_price_usd?: boolean;
  missing_area_m2?: boolean;
  invalid_area_m2?: boolean;
  parsing_failure?: boolean;
};

export type InvalidBreakdown = Record<InvalidImportCategory, number>;

@Injectable()
export class MarketDataImportDiagnosticsService {
  classifyInvalidRow(input: DiagnosticInput): InvalidImportRowReport {
    const reasons: InvalidImportCategory[] = [];

    if (input.parsing_failure) {
      reasons.push('parsing_failure');
    }
    if (input.missing_city) {
      reasons.push('missing_city');
    }
    if (input.missing_district) {
      reasons.push('missing_district');
    }
    if (input.missing_price_usd) {
      reasons.push('missing_price_usd');
    }
    if (input.invalid_price_usd) {
      reasons.push('invalid_price_usd');
    }
    if (input.missing_area_m2) {
      reasons.push('missing_area_m2');
    }
    if (input.invalid_area_m2) {
      reasons.push('invalid_area_m2');
    }

    const missingOrInvalidCount = reasons.filter(
      (reason) => reason !== 'parsing_failure',
    ).length;
    if (missingOrInvalidCount > 1) {
      reasons.push('multiple_missing_fields');
    }

    return {
      rowIndex: input.rowIndex,
      raw: input.raw,
      rejection_reasons: reasons.length > 0 ? reasons : ['parsing_failure'],
      parsed_values: input.parsed_values,
    };
  }

  buildBreakdown(rows: InvalidImportRowReport[]): InvalidBreakdown {
    const breakdown: InvalidBreakdown = {
      missing_city: 0,
      missing_district: 0,
      missing_price_usd: 0,
      invalid_price_usd: 0,
      missing_area_m2: 0,
      invalid_area_m2: 0,
      parsing_failure: 0,
      multiple_missing_fields: 0,
    };

    for (const row of rows) {
      for (const reason of row.rejection_reasons) {
        breakdown[reason] += 1;
      }
    }

    return breakdown;
  }
}
