import { BadRequestException, Injectable } from '@nestjs/common';
import {
  getAreaSearchCandidates,
  normalizeAreaValue,
} from '../advisor/utils/area-normalization';
import { PrismaService } from '../prisma/prisma.service';
import { computeMedian } from './similarity-score.util';

export type MarketStatus = 'HOT' | 'STABLE' | 'UNDERVALUED';

export type DistrictHeatmapRow = {
  district: string;
  properties_count: number;
  avg_price_per_m2: number;
  median_price_per_m2: number;
  min_price_per_m2: number;
  max_price_per_m2: number;
  market_status: MarketStatus;
};

@Injectable()
export class MarketStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getHeatmap(cityInput: string): Promise<{
    city: string;
    districts: DistrictHeatmapRow[];
  }> {
    const city = normalizeAreaValue('city', cityInput);
    if (!city) {
      throw new BadRequestException('city is required');
    }

    const cityCandidates = getAreaSearchCandidates('city', cityInput);
    const rows = await this.prisma.marketData.findMany({
      where: {
        city: { in: cityCandidates.length ? cityCandidates : [city] },
        is_outlier: false,
        price_per_m2: {
          gte: 50,
          lte: 10000,
        },
        district: {
          not: null,
        },
      },
      select: {
        district: true,
        price_per_m2: true,
      },
    });

    const usableRows = rows.filter(
      (row): row is { district: string; price_per_m2: number } =>
        typeof row.district === 'string' &&
        row.district.trim().length > 0 &&
        typeof row.price_per_m2 === 'number' &&
        Number.isFinite(row.price_per_m2) &&
        row.price_per_m2 >= 50 &&
        row.price_per_m2 <= 10000,
    );

    const cityAverage =
      usableRows.reduce((sum, row) => sum + row.price_per_m2, 0) /
      Math.max(usableRows.length, 1);

    const grouped = new Map<string, number[]>();
    for (const row of usableRows) {
      const districtKey =
        normalizeAreaValue('district', row.district) ?? row.district.trim().toLowerCase();
      const bucket = grouped.get(districtKey) ?? [];
      bucket.push(row.price_per_m2);
      grouped.set(districtKey, bucket);
    }

    const districts: DistrictHeatmapRow[] = Array.from(grouped.entries())
      .map(([district, values]) => {
        const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
        return {
          district,
          properties_count: values.length,
          avg_price_per_m2: Number(avg.toFixed(2)),
          median_price_per_m2: Number(computeMedian(values).toFixed(2)),
          min_price_per_m2: Number(Math.min(...values).toFixed(2)),
          max_price_per_m2: Number(Math.max(...values).toFixed(2)),
          market_status: this.resolveMarketStatus(avg, cityAverage),
        };
      })
      .sort((a, b) => b.avg_price_per_m2 - a.avg_price_per_m2);

    return {
      city,
      districts,
    };
  }

  async getDistrictStats(params: {
    city: string;
    district: string;
  }): Promise<{
    city: string;
    district: string;
    city_average_price_per_m2: number;
    district_stats: DistrictHeatmapRow | null;
    max_district_properties_count: number;
  }> {
    const heatmap = await this.getHeatmap(params.city);
    const district =
      normalizeAreaValue('district', params.district) ?? params.district.trim().toLowerCase();
    const districtStats =
      heatmap.districts.find((item) => item.district === district) ?? null;
    const cityAverage =
      heatmap.districts.reduce(
        (sum, item) => sum + item.avg_price_per_m2 * item.properties_count,
        0,
      ) /
      Math.max(
        heatmap.districts.reduce((sum, item) => sum + item.properties_count, 0),
        1,
      );
    const maxDistrictPropertiesCount = heatmap.districts.reduce(
      (max, item) => Math.max(max, item.properties_count),
      0,
    );

    return {
      city: heatmap.city,
      district,
      city_average_price_per_m2: Number(cityAverage.toFixed(2)),
      district_stats: districtStats,
      max_district_properties_count: maxDistrictPropertiesCount,
    };
  }

  private resolveMarketStatus(
    districtAverage: number,
    cityAverage: number,
  ): MarketStatus {
    if (cityAverage <= 0) {
      return 'STABLE';
    }

    if (districtAverage > cityAverage * 1.2) {
      return 'HOT';
    }
    if (districtAverage < cityAverage * 0.8) {
      return 'UNDERVALUED';
    }
    return 'STABLE';
  }
}
