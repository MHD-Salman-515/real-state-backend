import { BadRequestException, Injectable } from '@nestjs/common';
import { MarketData } from '@prisma/client';
import {
  getAreaSearchCandidates,
  normalizeAreaValue,
} from '../advisor/utils/area-normalization';
import { PrismaService } from '../prisma/prisma.service';
import {
  ComparableScoringBreakdown,
  computeSimilarityScore,
} from './similarity-score.util';

export type ComparableSearchInput = {
  city: string;
  district?: string;
  property_type: string;
  area_m2: number;
  bedrooms?: number;
};

export type RankedComparable = {
  id: number;
  title: string | null;
  city: string | null;
  district: string | null;
  property_type: string | null;
  area_m2: number | null;
  bedrooms: number | null;
  price_usd: number | null;
  price_per_m2: number | null;
  image_url: string | null;
  source_url: string | null;
  scoring: ComparableScoringBreakdown;
};

type ComparableSearchLevel = {
  level: 1 | 2 | 3 | 4;
  minResults: number;
  useDistrict: boolean;
  requirePropertyType: boolean;
  areaToleranceRatio: number;
  bedroomTolerance: number | null;
};

type ComparableSearchResult = {
  totalMatched: number;
  comparables: RankedComparable[];
  searchLevel: ComparableSearchLevel['level'];
};

@Injectable()
export class ComparableEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async findComparables(
    input: ComparableSearchInput,
  ): Promise<ComparableSearchResult> {
    if (!Number.isFinite(input.area_m2) || input.area_m2 <= 0) {
      throw new BadRequestException('area_m2 must be a positive number');
    }

    const cityNorm = normalizeAreaValue('city', input.city);
    const districtNorm = normalizeAreaValue('district', input.district);
    const propertyTypeNorm = normalizeAreaValue('property_type', input.property_type);

    if (!cityNorm || !propertyTypeNorm) {
      throw new BadRequestException('city and property_type are required');
    }

    const cityCandidates = getAreaSearchCandidates('city', input.city);
    const propertyTypeCandidates = getAreaSearchCandidates(
      'property_type',
      input.property_type,
    );
    const districtCandidates = input.district
      ? getAreaSearchCandidates('district', input.district)
      : [];

    const levels: ComparableSearchLevel[] = [
      {
        level: 1,
        minResults: 5,
        useDistrict: true,
        requirePropertyType: true,
        areaToleranceRatio: 0.25,
        bedroomTolerance: 1,
      },
      {
        level: 2,
        minResults: 5,
        useDistrict: false,
        requirePropertyType: true,
        areaToleranceRatio: 0.35,
        bedroomTolerance: 2,
      },
      {
        level: 3,
        minResults: 5,
        useDistrict: false,
        requirePropertyType: true,
        areaToleranceRatio: 0.5,
        bedroomTolerance: null,
      },
      {
        level: 4,
        minResults: 3,
        useDistrict: false,
        requirePropertyType: false,
        areaToleranceRatio: 0.6,
        bedroomTolerance: null,
      },
    ];

    let fallbackResult: ComparableSearchResult | null = null;

    for (const level of levels) {
      const rows = await this.prisma.marketData.findMany({
        where: {
          city: { in: cityCandidates.length ? cityCandidates : [cityNorm] },
          ...(level.useDistrict && districtNorm
            ? {
                district: {
                  in: districtCandidates.length ? districtCandidates : [districtNorm],
                },
              }
            : {}),
          ...(level.requirePropertyType
            ? {
                property_type: {
                  in: propertyTypeCandidates.length
                    ? propertyTypeCandidates
                    : [propertyTypeNorm],
                },
              }
            : {}),
          is_outlier: false,
          area_m2: {
            gte: input.area_m2 * (1 - level.areaToleranceRatio),
            lte: input.area_m2 * (1 + level.areaToleranceRatio),
          },
          ...(typeof input.bedrooms === 'number' && level.bedroomTolerance != null
            ? {
                bedrooms: {
                  gte: input.bedrooms - level.bedroomTolerance,
                  lte: input.bedrooms + level.bedroomTolerance,
                },
              }
            : {}),
        },
        select: {
          id: true,
          title: true,
          city: true,
          district: true,
          property_type: true,
          area_m2: true,
          bedrooms: true,
          price_usd: true,
          price_per_m2: true,
          image_url: true,
          source_url: true,
        },
        take: 250,
        orderBy: { created_at: 'desc' },
      });

      const ranked = rows
        .map((row) => this.rankComparable(row, { districtNorm, input }))
        .filter((row): row is RankedComparable => row != null)
        .sort((a, b) => b.scoring.similarity_score - a.scoring.similarity_score);

      const currentResult: ComparableSearchResult = {
        totalMatched: ranked.length,
        comparables: ranked.slice(0, 20),
        searchLevel: level.level,
      };

      if (!fallbackResult || currentResult.totalMatched > fallbackResult.totalMatched) {
        fallbackResult = currentResult;
      }

      if (currentResult.totalMatched >= level.minResults) {
        return currentResult;
      }
    }

    return (
      fallbackResult ?? {
        totalMatched: 0,
        comparables: [],
        searchLevel: 4,
      }
    );
  }

  private rankComparable(
    row: Pick<
      MarketData,
      | 'id'
      | 'title'
      | 'city'
      | 'district'
      | 'property_type'
      | 'area_m2'
      | 'bedrooms'
      | 'price_usd'
      | 'price_per_m2'
      | 'image_url'
      | 'source_url'
    >,
    params: {
      districtNorm?: string;
      input: ComparableSearchInput;
    },
  ): RankedComparable | null {
    const pricePerM2 = this.resolvePricePerM2(row);
    if (pricePerM2 == null || pricePerM2 <= 0) {
      return null;
    }

    const comparableDistrict = normalizeAreaValue('district', row.district);
    const comparablePropertyType = normalizeAreaValue(
      'property_type',
      row.property_type,
    );
    const scoring = computeSimilarityScore({
      targetDistrict: params.districtNorm,
      targetArea: params.input.area_m2,
      targetBedrooms: params.input.bedrooms,
      targetPropertyType:
        normalizeAreaValue('property_type', params.input.property_type)
        ?? params.input.property_type,
      comparableDistrict,
      comparableArea: row.area_m2,
      comparableBedrooms: row.bedrooms,
      comparablePropertyType,
    });

    return {
      id: row.id,
      title: row.title,
      city: row.city,
      district: row.district,
      property_type: row.property_type,
      area_m2: row.area_m2,
      bedrooms: row.bedrooms,
      price_usd: row.price_usd,
      price_per_m2: pricePerM2,
      image_url: row.image_url,
      source_url: row.source_url,
      scoring,
    };
  }

  private resolvePricePerM2(
    row: Pick<MarketData, 'price_per_m2' | 'price_usd' | 'area_m2'>,
  ): number | null {
    const direct = Number(row.price_per_m2 ?? 0);
    if (Number.isFinite(direct) && direct > 0) {
      return Number(direct.toFixed(4));
    }

    const price = Number(row.price_usd ?? 0);
    const area = Number(row.area_m2 ?? 0);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(area) || area <= 0) {
      return null;
    }

    return Number((price / area).toFixed(4));
  }
}
