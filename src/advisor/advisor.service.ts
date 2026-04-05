import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UrbanexPrismaService } from '../prisma/urbanex-prisma.service';
import { SellerPriceDto } from './dto/seller-price.dto';
import { BuyerEvaluateDto } from './dto/buyer-evaluate.dto';
import { ExplainDto } from './dto/explain.dto';
import { TrackOutcomeDto } from './dto/track-outcome.dto';
import { SimulateDto } from './dto/simulate.dto';
import { InvestmentAnalysisDto } from './dto/investment-analysis.dto';
import { AdvisorExplanationService } from './explanation/advisor-explanation.service';
import { buildExplainTrace } from './explanation/explain-trace.helper';
import {
  ConfidenceMeta,
  ConfidenceService,
} from './confidence/confidence.service';
import {
  AdvisorAnalyticsResponse,
  AdvisorEvaluateResponse,
  AdvisorExplainLanguage,
  AdvisorExplainResponse,
  AdvisorInsightsResponse,
  AdvisorInvestmentAnalysisResponse,
  AdvisorSimulationResponse,
  AdvisorTrackResponse,
  BuyerEvaluateResponse,
  BuyerVerdict,
  SellerPriceCoreResult,
  SellerPriceResponse,
} from './advisor.types';
import { detectAdvisorLanguage } from './utils/language-detector';
import { normalizeAreaInput, normalizeAreaValue } from './utils/area-normalization';
import { ADVISOR_CACHE } from './cache/advisor-cache.port';
import type { AdvisorCachePort } from './cache/advisor-cache.port';
import { MarketPricingService } from '../market-intelligence/market-pricing.service';
import { MarketStatsService } from '../market-intelligence/market-stats.service';

interface AreasPriceRow {
  city: string;
  district: string;
  property_type: string;
  avg_price_per_m2: number | string;
  sample_count: number | string | null;
  updated_at: Date | string;
}

interface FxRateRow {
  id: number;
  usd_to_syp: number;
  source?: string | null;
  effective_at: Date | string;
}

interface StabilityStatsRow {
  sample_count: bigint | number;
  avg_ppm2: number | string | null;
  stddev_ppm2: number | string | null;
}

interface NormalizedSellerInput {
  city_norm: string;
  district_norm: string;
  property_type_norm: string;
}

interface AreaLookupInput {
  city: string;
  district: string;
  property_type: string;
}

interface MarketInsightRow {
  area_m2: number | null;
  price_syp: number | null;
  price_usd: number | null;
  price_per_m2_syp: number | null;
  fx_usd_to_syp: number | null;
  created_at: Date;
}

@Injectable()
export class AdvisorService {
  constructor(
    private readonly urbanexPrisma: UrbanexPrismaService,
    private readonly explanationService: AdvisorExplanationService,
    private readonly confidenceService: ConfidenceService,
    private readonly marketPricingService: MarketPricingService,
    private readonly marketStatsService: MarketStatsService,
    @Inject(ADVISOR_CACHE) private readonly cacheService: AdvisorCachePort,
  ) {}

  async evaluateMarketPrice(params: {
    city: string;
    district?: string;
    property_type: string;
    area_m2: number;
    bedrooms?: number;
    ask_price: number;
  }): Promise<AdvisorEvaluateResponse> {
    return this.marketPricingService.evaluate(params);
  }

  async getSimilarComparables(params: {
    city: string;
    district?: string;
    property_type: string;
    area_m2: number;
    bedrooms?: number;
  }) {
    return this.marketPricingService.getSimilar(params);
  }

  async investmentAnalysis(
    dto: InvestmentAnalysisDto,
  ): Promise<AdvisorInvestmentAnalysisResponse> {
    const valuation = await this.marketPricingService.evaluate({
      city: dto.city,
      district: dto.district,
      property_type: dto.property_type,
      area_m2: dto.area_m2,
      bedrooms: dto.bedrooms,
      ask_price: dto.ask_price,
    });

    const districtStats = await this.marketStatsService.getDistrictStats({
      city: dto.city,
      district: dto.district,
    });

    const propertiesCount = districtStats.district_stats?.properties_count ?? 0;
    const districtDemand =
      districtStats.max_district_properties_count > 0
        ? Math.min(1, propertiesCount / districtStats.max_district_properties_count)
        : 0;
    const marketLiquidity = Math.min(1, valuation.selected_comparables / 20);
    const priceGap = this.resolveInvestmentPriceGap({
      askPrice: dto.ask_price,
      estimatedPrice: valuation.estimated_price,
    });

    const investmentScore = Number(
      (
        (0.4 * priceGap + 0.3 * districtDemand + 0.3 * marketLiquidity) *
        10
      ).toFixed(2),
    );

    const marketStatus = districtStats.district_stats?.market_status ?? 'STABLE';

    return {
      estimated_price: valuation.estimated_price,
      evaluation: valuation.evaluation,
      confidence: valuation.confidence,
      difference_percent: valuation.difference_percent,
      investment_score: investmentScore,
      market_status: marketStatus,
      advice: this.buildInvestmentAdvice({
        evaluation: valuation.evaluation,
        marketStatus,
        confidence: valuation.confidence,
      }),
    };
  }

  async getSellerPriceSuggestion(dto: SellerPriceDto): Promise<SellerPriceResponse> {
    if (!Number.isFinite(dto.area_m2) || dto.area_m2 <= 0) {
      throw new BadRequestException('area_m2 must be a positive number');
    }

    const language = detectAdvisorLanguage(dto.user_message);
    const normalizedInput = this.normalizeSellerInput(dto);
    const cacheKey = this.buildSellerCacheKey(normalizedInput, dto.area_m2);

    const cachedCoreResult = await this.cacheService.getSellerPrice(cacheKey);
    const coreResult =
      cachedCoreResult ??
      (await this.computeSellerPriceCoreResult(dto, normalizedInput));

    if (!cachedCoreResult) {
      await this.cacheService.setSellerPrice(cacheKey, coreResult);
    }

    const summary = this.explanationService.buildSellerSummary({
      language,
      optimal_price_syp: coreResult.optimal_price_syp,
      fast_sale_price_syp: coreResult.fast_sale_price_syp,
    });

    return {
      ...coreResult,
      summary,
    };
  }

  async buyerEvaluate(dto: BuyerEvaluateDto): Promise<BuyerEvaluateResponse> {
    if (!Number.isFinite(dto.area_m2) || dto.area_m2 <= 0) {
      throw new BadRequestException('area_m2 must be a positive number');
    }

    if (dto.ask_price_syp == null && dto.ask_price_usd == null) {
      throw new BadRequestException(
        'At least one of ask_price_syp or ask_price_usd is required',
      );
    }

    const language = detectAdvisorLanguage(dto.user_message);
    const normalizedInput = this.normalizeSellerInput(dto);
    const areaRow = await this.findAreaPriceRow(normalizedInput);
    const fxRate = await this.findLatestFxRate();

    const baselinePricePerM2Usd = this.toPositiveNumber(areaRow.avg_price_per_m2);
    const sampleCount = this.toSafeNonNegativeNumber(areaRow.sample_count);

    const baselineUsd = baselinePricePerM2Usd * dto.area_m2;
    const baselineSyp = baselineUsd * fxRate.usd_to_syp;
    const askSyp = this.resolveAskPriceSyp(dto, fxRate.usd_to_syp);

    const fairMin = Math.round(baselineSyp * 0.93);
    const fairMax = Math.round(baselineSyp * 1.07);
    const roundedAskSyp = Math.round(askSyp);
    const verdict = this.resolveBuyerVerdict(roundedAskSyp, fairMin, fairMax);
    const confidenceData = await this.computeConfidenceData({
      sampleCount,
      updatedAt: new Date(areaRow.updated_at),
      normalizedInput,
    });
    const explainTrace = buildExplainTrace({
      inputs_used: {
        city: normalizedInput.city_norm,
        district: normalizedInput.district_norm,
        property_type: normalizedInput.property_type_norm,
        area_m2: dto.area_m2,
        ask_price_syp: roundedAskSyp,
      },
      data_sources: {
        areas_price: {
          area_key: `${areaRow.city}|${areaRow.district}|${areaRow.property_type}`,
          avg_price_per_m2_usd: baselinePricePerM2Usd,
          sample_count: sampleCount,
          updated_at: new Date(areaRow.updated_at).toISOString(),
        },
        market_data: {
          sample_count: sampleCount,
          updated_at: new Date(areaRow.updated_at).toISOString(),
          scope: 'derived_from_areas_price',
        },
        fx_rate: {
          id: Number(fxRate.id),
          source: fxRate.source ?? null,
          effective_at: new Date(fxRate.effective_at).toISOString(),
          usd_to_syp: fxRate.usd_to_syp,
        },
      },
      computation_steps: [
        {
          step: 'baseline_ppm2_usd * area_m2 => baseline_total_usd',
          value: { baseline_ppm2_usd: baselinePricePerM2Usd, area_m2: dto.area_m2, baseline_total_usd: baselineUsd },
        },
        {
          step: 'baseline_total_usd * fx => baseline_total_syp',
          value: { baseline_total_syp: Math.round(baselineSyp) },
        },
        {
          step: 'fair_range = baseline_total_syp * [0.93, 1.07]',
          value: { fair_min_syp: fairMin, fair_max_syp: fairMax },
        },
        {
          step: 'compare ask_price_syp to fair range => verdict',
          value: { ask_price_syp: roundedAskSyp, verdict },
        },
      ],
      confidence_components: {
        ...confidenceData.meta,
        confidence: confidenceData.confidence,
      },
    });

    const summary = this.explanationService.buildBuyerSummary({
      language,
      verdict,
      ask: roundedAskSyp,
      min: fairMin,
      max: fairMax,
    });

    return {
      verdict,
      ask_price_syp: roundedAskSyp,
      fair_range_syp: {
        min: fairMin,
        max: fairMax,
      },
      confidence: confidenceData.confidence,
      confidence_meta: confidenceData.meta,
      summary,
      fx_used: fxRate.usd_to_syp,
      fx_rate_id: Number(fxRate.id),
      fx_effective_at: new Date(fxRate.effective_at),
      citations: {
        area_key: `${areaRow.city}|${areaRow.district}|${areaRow.property_type}`,
        sample_count: sampleCount,
        updated_at: new Date(areaRow.updated_at),
      },
      explain_trace: explainTrace,
    };
  }

  async explain(dto: ExplainDto): Promise<AdvisorExplainResponse> {
    const language = this.mapExplainLanguage(detectAdvisorLanguage(dto.user_message));
    const deterministic = this.buildDeterministicExplanation(dto.mode, dto.result, language);
    const openAiApiKey = process.env.OPENAI_API_KEY;

    if (!openAiApiKey) {
      return {
        text: deterministic,
        language,
      };
    }

    try {
      const llmText = await this.rephraseWithLlm({
        sourceText: deterministic,
        language,
        apiKey: openAiApiKey,
      });

      return {
        text: llmText,
        language,
      };
    } catch {
      return {
        text: deterministic,
        language,
      };
    }
  }

  async trackOutcome(
    dto: TrackOutcomeDto,
    ownerId?: number,
  ): Promise<AdvisorTrackResponse> {
    const finalPrice = this.toPositiveBigInt(dto.final_price_syp);
    const row = await this.urbanexPrisma.advisorOutcome.create({
      data: {
        logId: dto.log_id,
        action: dto.action,
        finalPriceSyp: finalPrice,
        ownerId: ownerId ?? null,
      },
    });

    return {
      id: row.id.toString(),
      log_id: row.logId,
      action: row.action as AdvisorTrackResponse['action'],
      final_price_syp: row.finalPriceSyp.toString(),
    };
  }

  async getAnalytics(days: number): Promise<AdvisorAnalyticsResponse> {
    const from = new Date();
    from.setDate(from.getDate() - days);

    const [suggestions, groupedOutcomes] = await Promise.all([
      this.urbanexPrisma.advisorRequestLog.count({
        where: { createdAt: { gte: from } },
      }),
      this.urbanexPrisma.advisorOutcome.groupBy({
        by: ['action'],
        where: { createdAt: { gte: from } },
        _count: { _all: true },
      }),
    ]);

    const outcomeCounts: AdvisorAnalyticsResponse['outcomes'] = {
      accepted_optimal: 0,
      accepted_fast: 0,
      edited: 0,
      ignored: 0,
      other: 0,
    };

    for (const item of groupedOutcomes) {
      const count = item._count._all;
      if (item.action === 'accepted_optimal') {
        outcomeCounts.accepted_optimal += count;
      } else if (item.action === 'accepted_fast') {
        outcomeCounts.accepted_fast += count;
      } else if (item.action === 'edited') {
        outcomeCounts.edited += count;
      } else if (item.action === 'ignored') {
        outcomeCounts.ignored += count;
      } else {
        outcomeCounts.other += count;
      }
    }

    const totalOutcomes = groupedOutcomes.reduce(
      (sum, item) => sum + item._count._all,
      0,
    );

    return {
      days,
      totals: {
        suggestions,
        outcomes: totalOutcomes,
      },
      outcomes: outcomeCounts,
    };
  }

  async getInsights(params: {
    city: string;
    district?: string;
    property_type?: string;
    days_window: number;
    suggested_price_syp?: number;
    area_m2?: number;
    user_message?: string;
  }): Promise<AdvisorInsightsResponse> {
    const city = normalizeAreaValue('city', params.city);
    const district = normalizeAreaValue('district', params.district);
    const propertyType = normalizeAreaValue('property_type', params.property_type);
    if (!city) {
      throw new BadRequestException('city is required');
    }

    const from = new Date();
    from.setDate(from.getDate() - params.days_window);

    const rows = await this.urbanexPrisma.marketData.findMany({
      where: {
        city,
        ...(district ? { district } : {}),
        ...(propertyType ? { property_type: propertyType } : {}),
        created_at: { gte: from },
        is_outlier: false,
      },
      select: {
        area_m2: true,
        price_syp: true,
        price_usd: true,
        price_per_m2_syp: true,
        fx_usd_to_syp: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });

    const points = rows
      .map((row) => ({
        ppm2: this.resolvePpm2Syp(row),
        created_at: new Date(row.created_at),
      }))
      .filter((row): row is { ppm2: number; created_at: Date } => row.ppm2 != null);

    if (points.length < 3) {
      throw new BadRequestException('Not enough market samples for insights');
    }

    const ppm2Values = points.map((item) => item.ppm2);
    const avg = ppm2Values.reduce((sum, value) => sum + value, 0) / ppm2Values.length;
    const variance =
      ppm2Values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / ppm2Values.length;
    const stddev = Math.sqrt(Math.max(0, variance));
    const volatility = avg > 0 ? stddev / avg : 0;
    const trend = this.computeTrendLast30Days(points);

    const suggestedPpm2 = this.resolveSuggestedPpm2({
      suggested_price_syp: params.suggested_price_syp,
      area_m2: params.area_m2,
    });
    const suggestedPercentile =
      suggestedPpm2 == null
        ? undefined
        : this.computePercentile(ppm2Values, suggestedPpm2);

    let areaRow: AreasPriceRow | null = null;
    if (district && propertyType) {
      try {
        areaRow = await this.findAreaPriceRow({
          city_norm: city,
          district_norm: district,
          property_type_norm: propertyType,
        });
      } catch {
        areaRow = null;
      }
    }

    const confidenceMeta =
      areaRow != null
        ? (
            await this.computeConfidenceData({
              sampleCount: this.toSafeNonNegativeNumber(areaRow.sample_count),
              updatedAt: new Date(areaRow.updated_at),
              normalizedInput: {
                city_norm: areaRow.city,
                district_norm: areaRow.district,
                property_type_norm: areaRow.property_type,
              },
            })
          ).meta
        : undefined;

    const advisorLanguage = detectAdvisorLanguage(params.user_message);
    const language = this.mapInsightsLanguage(advisorLanguage);
    const latestSampleAt = points[points.length - 1]?.created_at;
    const explainTrace = buildExplainTrace({
      inputs_used: {
        city,
        ...(district ? { district } : {}),
        ...(propertyType ? { property_type: propertyType } : {}),
        days_window: params.days_window,
        ...(params.suggested_price_syp != null
          ? { suggested_price_syp: params.suggested_price_syp }
          : {}),
        ...(params.area_m2 != null ? { area_m2: params.area_m2 } : {}),
      },
      data_sources: {
        market_data: {
          sample_count: ppm2Values.length,
          updated_at: latestSampleAt ? latestSampleAt.toISOString() : null,
          non_outliers_only: true,
        },
        ...(areaRow
          ? {
              areas_price: {
                area_key: `${areaRow.city}|${areaRow.district}|${areaRow.property_type}`,
                sample_count: this.toSafeNonNegativeNumber(areaRow.sample_count),
                updated_at: new Date(areaRow.updated_at).toISOString(),
              },
            }
          : {}),
      },
      computation_steps: [
        {
          step: 'resolve ppm2_syp per row (direct ppm2_syp or derived from total/area)',
          value: { sample_count: ppm2Values.length },
        },
        {
          step: 'compute median/avg/min/max of ppm2_syp',
          value: {
            median_ppm2_syp: this.computeMedian(ppm2Values),
            avg_ppm2_syp: avg,
            min_ppm2_syp: Math.min(...ppm2Values),
            max_ppm2_syp: Math.max(...ppm2Values),
          },
        },
        {
          step: 'compute volatility index (stddev/avg) and last_30_days trend',
          value: {
            volatility_index: volatility,
            trend_last_30_days: trend,
          },
        },
        ...(suggestedPercentile != null
          ? [
              {
                step: 'compute suggested percentile within ppm2 distribution',
                value: { suggested_percentile: suggestedPercentile },
              },
            ]
          : []),
      ],
      ...(confidenceMeta
        ? { confidence_components: confidenceMeta }
        : {}),
    });

    return {
      area_scope: {
        city,
        ...(district ? { district } : {}),
        ...(propertyType ? { property_type: propertyType } : {}),
      },
      days_window: params.days_window,
      sample_count: ppm2Values.length,
      stats: {
        median_ppm2_syp: this.computeMedian(ppm2Values),
        avg_ppm2_syp: avg,
        min_ppm2_syp: Math.min(...ppm2Values),
        max_ppm2_syp: Math.max(...ppm2Values),
        volatility_index: volatility,
        trend_last_30_days: trend,
        ...(suggestedPercentile != null ? { suggested_percentile: suggestedPercentile } : {}),
      },
      confidence_meta: confidenceMeta,
      message: this.buildInsightsMessage({
        language,
        trend,
        volatility,
        sampleCount: ppm2Values.length,
      }),
      language,
      explain_trace: explainTrace,
    };
  }

  async simulate(dto: SimulateDto): Promise<AdvisorSimulationResponse> {
    if (!Number.isFinite(dto.area_m2) || dto.area_m2 <= 0) {
      throw new BadRequestException('area_m2 must be a positive number');
    }
    if (!Number.isFinite(dto.proposed_price_syp) || dto.proposed_price_syp <= 0) {
      throw new BadRequestException('proposed_price_syp must be a positive number');
    }

    const normalizedInput = this.normalizeSellerInput(dto);
    const daysWindow = dto.days_window ?? 90;

    const from = new Date();
    from.setDate(from.getDate() - daysWindow);

    const rows = await this.urbanexPrisma.marketData.findMany({
      where: {
        city: normalizedInput.city_norm,
        district: normalizedInput.district_norm,
        property_type: normalizedInput.property_type_norm,
        created_at: { gte: from },
        is_outlier: false,
      },
      select: {
        area_m2: true,
        price_syp: true,
        price_usd: true,
        price_per_m2_syp: true,
        fx_usd_to_syp: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });

    const points = rows
      .map((row) => ({
        ppm2: this.resolvePpm2Syp(row),
        created_at: new Date(row.created_at),
      }))
      .filter((row): row is { ppm2: number; created_at: Date } => row.ppm2 != null);

    if (points.length < 3) {
      throw new BadRequestException('Not enough market samples for simulation');
    }

    const values = points.map((point) => point.ppm2);
    const median = this.computeMedian(values);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
    const volatility = avg > 0 ? Math.sqrt(Math.max(0, variance)) / avg : 0;
    const trend = this.computeTrendLast30Days(points);

    const subjectPpm2 = dto.proposed_price_syp / dto.area_m2;
    const deviation = median > 0 ? (subjectPpm2 - median) / median : 0;
    const deviationPercent = deviation * 100;
    const trendPenalty =
      trend.direction === 'up' ? 0.12 : trend.direction === 'down' ? 0.04 : 0.08;
    const riskScore =
      Math.abs(deviation) * 0.6 + volatility * 0.25 + trendPenalty * 0.15;

    let saleSpeed: AdvisorSimulationResponse['sale_speed_class'];
    if (deviationPercent < -5) {
      saleSpeed = 'fast';
    } else if (deviationPercent <= 5) {
      saleSpeed = 'normal';
    } else if (deviationPercent <= 12) {
      saleSpeed = 'slow';
    } else {
      saleSpeed = 'very_slow';
    }

    if (volatility > 0.25) {
      saleSpeed = this.downgradeSaleSpeed(saleSpeed);
    }

    const language = this.mapInsightsLanguage('syrian_dialect');
    const latestSampleAt = points[points.length - 1]?.created_at;
    const explainTrace = buildExplainTrace({
      inputs_used: {
        city: normalizedInput.city_norm,
        district: normalizedInput.district_norm,
        property_type: normalizedInput.property_type_norm,
        area_m2: dto.area_m2,
        proposed_price_syp: dto.proposed_price_syp,
        days_window: daysWindow,
      },
      data_sources: {
        market_data: {
          sample_count: values.length,
          updated_at: latestSampleAt ? latestSampleAt.toISOString() : null,
          non_outliers_only: true,
        },
      },
      computation_steps: [
        {
          step: 'compute median ppm2_syp from market samples',
          value: { median_ppm2_syp: median },
        },
        {
          step: 'subject_ppm2 = proposed_price_syp / area_m2',
          value: { subject_ppm2_syp: subjectPpm2 },
        },
        {
          step: 'deviation_percent = ((subject_ppm2 - median_ppm2)/median_ppm2)*100',
          value: { deviation_percent: deviationPercent },
        },
        {
          step: 'risk_score from deviation, volatility and trend_penalty',
          value: { risk_score: riskScore, volatility_index: volatility, trend_penalty: trendPenalty },
        },
        {
          step: 'classify sale_speed_class and downgrade if volatility > 0.25',
          value: { sale_speed_class: saleSpeed },
        },
      ],
    });
    return {
      area_scope: {
        city: normalizedInput.city_norm,
        district: normalizedInput.district_norm,
        property_type: normalizedInput.property_type_norm,
      },
      days_window: daysWindow,
      sample_count: values.length,
      median_ppm2_syp: median,
      subject_ppm2_syp: subjectPpm2,
      deviation_percent: deviationPercent,
      volatility_index: volatility,
      trend_last_30_days: trend,
      risk_score: riskScore,
      sale_speed_class: saleSpeed,
      message: this.buildSimulationMessage({
        deviationPercent,
        saleSpeed,
        riskScore,
      }),
      language,
      explain_trace: explainTrace,
    };
  }

  private async computeSellerPriceCoreResult(
    dto: SellerPriceDto,
    normalizedInput: NormalizedSellerInput,
  ): Promise<SellerPriceCoreResult> {
    const areaRow = await this.findAreaPriceRow(normalizedInput);
    const fxRate = await this.findLatestFxRate();

    const baselinePricePerM2Usd = this.toPositiveNumber(areaRow.avg_price_per_m2);
    const sampleCount = this.toSafeNonNegativeNumber(areaRow.sample_count);

    const medianUsd = baselinePricePerM2Usd * dto.area_m2;
    const optimalUsd = medianUsd * 1.04;
    const fastUsd = medianUsd * 0.96;

    const optimalSyp = Math.round(optimalUsd * fxRate.usd_to_syp);
    const fastSyp = Math.round(fastUsd * fxRate.usd_to_syp);
    const confidenceData = await this.computeConfidenceData({
      sampleCount,
      updatedAt: new Date(areaRow.updated_at),
      normalizedInput,
    });
    const explainTrace = buildExplainTrace({
      inputs_used: {
        city: normalizedInput.city_norm,
        district: normalizedInput.district_norm,
        property_type: normalizedInput.property_type_norm,
        area_m2: dto.area_m2,
      },
      data_sources: {
        areas_price: {
          area_key: `${areaRow.city}|${areaRow.district}|${areaRow.property_type}`,
          avg_price_per_m2_usd: baselinePricePerM2Usd,
          sample_count: sampleCount,
          updated_at: new Date(areaRow.updated_at).toISOString(),
        },
        market_data: {
          sample_count: sampleCount,
          updated_at: new Date(areaRow.updated_at).toISOString(),
          scope: 'derived_from_areas_price',
        },
        fx_rate: {
          id: Number(fxRate.id),
          source: fxRate.source ?? null,
          effective_at: new Date(fxRate.effective_at).toISOString(),
          usd_to_syp: fxRate.usd_to_syp,
        },
      },
      computation_steps: [
        {
          step: 'baseline_total_usd = avg_price_per_m2_usd * area_m2',
          value: { baseline_total_usd: medianUsd },
        },
        {
          step: 'optimal_usd = baseline_total_usd * 1.04, fast_usd = baseline_total_usd * 0.96',
          value: { optimal_usd: optimalUsd, fast_usd: fastUsd },
        },
        {
          step: 'convert USD totals to SYP by latest FX',
          value: { optimal_price_syp: optimalSyp, fast_sale_price_syp: fastSyp },
        },
        {
          step: 'build +/-5% ranges around each target price',
          value: {
            optimal_range_syp: this.buildRange(optimalSyp),
            fast_sale_range_syp: this.buildRange(fastSyp),
          },
        },
      ],
      confidence_components: {
        ...confidenceData.meta,
        confidence: confidenceData.confidence,
      },
    });

    return {
      optimal_price_syp: optimalSyp,
      optimal_range_syp: this.buildRange(optimalSyp),
      fast_sale_price_syp: fastSyp,
      fast_sale_range_syp: this.buildRange(fastSyp),
      confidence: confidenceData.confidence,
      confidence_meta: confidenceData.meta,
      fx_used: fxRate.usd_to_syp,
      fx_rate_id: Number(fxRate.id),
      fx_effective_at: new Date(fxRate.effective_at),
      citations: {
        area_key: `${areaRow.city}|${areaRow.district}|${areaRow.property_type}`,
        sample_count: sampleCount,
        updated_at: new Date(areaRow.updated_at),
      },
      explain_trace: explainTrace,
    };
  }

  private async findAreaPriceRow(
    normalizedInput: NormalizedSellerInput,
  ): Promise<AreasPriceRow> {
    const rows = await this.urbanexPrisma.$queryRaw<AreasPriceRow[]>(Prisma.sql`
      SELECT city, district, property_type, avg_price_per_m2, sample_count, updated_at
      FROM areas_price
      WHERE city = ${normalizedInput.city_norm}
        AND district = ${normalizedInput.district_norm}
        AND property_type = ${normalizedInput.property_type_norm}
      LIMIT 1
    `);

    if (rows.length > 0) {
      return rows[0];
    }

    // Transitional fallback until ingestion normalizes stored values.
    const fallbackRows = await this.urbanexPrisma.$queryRaw<AreasPriceRow[]>(Prisma.sql`
      SELECT city, district, property_type, avg_price_per_m2, sample_count, updated_at
      FROM areas_price
      WHERE LOWER(city) = LOWER(${normalizedInput.city_norm})
        AND LOWER(district) = LOWER(${normalizedInput.district_norm})
        AND LOWER(property_type) = LOWER(${normalizedInput.property_type_norm})
      LIMIT 1
    `);

    if (fallbackRows.length === 0) {
      throw new BadRequestException(
        `No pricing baseline found for ${normalizedInput.city_norm}/${normalizedInput.district_norm}/${normalizedInput.property_type_norm}`,
      );
    }

    return fallbackRows[0];
  }

  private async findLatestFxRate(): Promise<FxRateRow> {
    const rows = await this.urbanexPrisma.$queryRaw<FxRateRow[]>(Prisma.sql`
      SELECT id, usd_to_syp, source, effective_at
      FROM fx_rates
      WHERE effective_at <= NOW()
      ORDER BY effective_at DESC
      LIMIT 1
    `);

    if (rows.length === 0) {
      throw new BadRequestException('No FX rate available in fx_rates');
    }

    return {
      id: rows[0].id,
      usd_to_syp: this.toPositiveNumber(rows[0].usd_to_syp),
      source: rows[0].source ?? null,
      effective_at: rows[0].effective_at,
    };
  }

  private normalizeSellerInput(dto: AreaLookupInput): NormalizedSellerInput {
    const normalized = normalizeAreaInput({
      city: dto.city,
      district: dto.district,
      property_type: dto.property_type,
    });

    return {
      city_norm: normalized.city_norm ?? '',
      district_norm: normalized.district_norm ?? '',
      property_type_norm: normalized.property_type_norm ?? '',
    };
  }

  private toPositiveNumber(value: number | string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('Stored numeric data is invalid');
    }

    return parsed;
  }

  private toSafeNonNegativeNumber(value: number | string | null): number {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 0;
    }

    return parsed;
  }

  private buildRange(value: number): { min: number; max: number } {
    return {
      min: Math.round(value * 0.95),
      max: Math.round(value * 1.05),
    };
  }

  private resolveAskPriceSyp(dto: BuyerEvaluateDto, fxRate: number): number {
    if (dto.ask_price_usd != null) {
      const askUsd = this.toPositiveNumber(dto.ask_price_usd);
      return askUsd * fxRate;
    }

    return this.toPositiveNumber(dto.ask_price_syp as number);
  }

  private resolveBuyerVerdict(
    askSyp: number,
    fairMin: number,
    fairMax: number,
  ): BuyerVerdict {
    if (askSyp < fairMin) {
      return 'cheap';
    }

    if (askSyp > fairMax) {
      return 'expensive';
    }

    return 'fair';
  }

  private buildSellerCacheKey(
    normalizedInput: NormalizedSellerInput,
    areaM2: number,
  ): string {
    return `${normalizedInput.city_norm}|${normalizedInput.district_norm}|${normalizedInput.property_type_norm}|${areaM2}`;
  }

  private async computeConfidenceData(params: {
    sampleCount: number;
    updatedAt: Date;
    normalizedInput: NormalizedSellerInput;
  }): Promise<{ confidence: number; meta: ConfidenceMeta }> {
    const stabilityCv = await this.findStabilityCv(params.normalizedInput);
    const meta: ConfidenceMeta = {
      sample_score: this.confidenceService.computeSampleScore(params.sampleCount),
      recency_score: this.confidenceService.computeRecencyScore(params.updatedAt),
      stability_score: this.confidenceService.computeStabilityScore(stabilityCv),
    };

    return {
      confidence: this.confidenceService.compute(meta),
      meta,
    };
  }

  private async findStabilityCv(
    normalizedInput: NormalizedSellerInput,
  ): Promise<number | null> {
    const rows = await this.urbanexPrisma.$queryRaw<StabilityStatsRow[]>(Prisma.sql`
      SELECT
        COUNT(*) AS sample_count,
        AVG(
          COALESCE(
            price_per_m2_syp,
            CASE WHEN area_m2 > 0 AND price_syp > 0 THEN price_syp / area_m2 END,
            CASE WHEN area_m2 > 0 AND price_usd > 0 AND fx_usd_to_syp > 0 THEN (price_usd * fx_usd_to_syp) / area_m2 END
          )
        ) AS avg_ppm2,
        STDDEV_POP(
          COALESCE(
            price_per_m2_syp,
            CASE WHEN area_m2 > 0 AND price_syp > 0 THEN price_syp / area_m2 END,
            CASE WHEN area_m2 > 0 AND price_usd > 0 AND fx_usd_to_syp > 0 THEN (price_usd * fx_usd_to_syp) / area_m2 END
          )
        ) AS stddev_ppm2
      FROM market_data
      WHERE city = ${normalizedInput.city_norm}
        AND district = ${normalizedInput.district_norm}
        AND property_type = ${normalizedInput.property_type_norm}
        AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        AND area_m2 > 0
    `);

    if (!rows.length) {
      return null;
    }

    const sampleCount = Number(rows[0].sample_count ?? 0);
    const avg = Number(rows[0].avg_ppm2 ?? 0);
    const stddev = Number(rows[0].stddev_ppm2 ?? 0);

    if (!Number.isFinite(sampleCount) || sampleCount < 5) {
      return null;
    }
    if (!Number.isFinite(avg) || avg <= 0 || !Number.isFinite(stddev) || stddev < 0) {
      return null;
    }

    return stddev / avg;
  }

  private mapExplainLanguage(language: ReturnType<typeof detectAdvisorLanguage>): AdvisorExplainLanguage {
    if (language === 'en') {
      return 'en';
    }
    if (language === 'msa') {
      return 'ar';
    }
    return 'ar_sy';
  }

  private buildDeterministicExplanation(
    mode: 'seller' | 'buyer',
    result: Record<string, unknown>,
    language: AdvisorExplainLanguage,
  ): string {
    if (mode === 'seller') {
      const optimal = this.toSafeDisplayNumber(result.optimal_price_syp);
      const optimalMin = this.toSafeDisplayNumber(this.pickNested(result, ['optimal_range_syp', 'min']));
      const optimalMax = this.toSafeDisplayNumber(this.pickNested(result, ['optimal_range_syp', 'max']));
      const fast = this.toSafeDisplayNumber(result.fast_sale_price_syp);
      const fastMin = this.toSafeDisplayNumber(this.pickNested(result, ['fast_sale_range_syp', 'min']));
      const fastMax = this.toSafeDisplayNumber(this.pickNested(result, ['fast_sale_range_syp', 'max']));
      const confidence = this.toSafeDisplayNumber(result.confidence);

      if (language === 'en') {
        return `Optimal listing price is ${optimal} SYP (range ${optimalMin}-${optimalMax}). Fast-sale price is ${fast} SYP (range ${fastMin}-${fastMax}). Confidence is ${confidence}.`;
      }

      if (language === 'ar') {
        return `السعر الأنسب للعرض هو ${optimal} ليرة سورية (النطاق ${optimalMin}-${optimalMax}). سعر البيع السريع هو ${fast} ليرة سورية (النطاق ${fastMin}-${fastMax}). مستوى الثقة ${confidence}.`;
      }

      return `السعر الأفضل للعرض ${optimal} ل.س (النطاق ${optimalMin}-${optimalMax})، وسعر البيع السريع ${fast} ل.س (النطاق ${fastMin}-${fastMax})، والثقة ${confidence}.`;
    }

    const verdict = String(result.verdict ?? '-');
    const ask = this.toSafeDisplayNumber(result.ask_price_syp);
    const fairMin = this.toSafeDisplayNumber(this.pickNested(result, ['fair_range_syp', 'min']));
    const fairMax = this.toSafeDisplayNumber(this.pickNested(result, ['fair_range_syp', 'max']));
    const confidence = this.toSafeDisplayNumber(result.confidence);

    if (language === 'en') {
      return `Asking price is ${ask} SYP. Fair range is ${fairMin}-${fairMax}. Verdict is ${verdict}. Confidence is ${confidence}.`;
    }

    if (language === 'ar') {
      return `السعر المطلوب هو ${ask} ليرة سورية. النطاق العادل هو ${fairMin}-${fairMax}. التقييم هو ${verdict}. مستوى الثقة ${confidence}.`;
    }

    return `السعر المطلوب ${ask} ل.س، والنطاق العادل ${fairMin}-${fairMax}، والتقييم ${verdict}، والثقة ${confidence}.`;
  }

  private pickNested(
    source: Record<string, unknown>,
    path: string[],
  ): unknown {
    let cursor: unknown = source;
    for (const key of path) {
      if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
        return undefined;
      }
      cursor = (cursor as Record<string, unknown>)[key];
    }
    return cursor;
  }

  private toSafeDisplayNumber(value: unknown): string {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return Math.round(asNumber).toLocaleString('en-US');
    }
    return '-';
  }

  private toPositiveBigInt(value: string | number): bigint {
    try {
      const normalized = String(value).trim();
      if (!/^\d+$/.test(normalized)) {
        throw new BadRequestException('final_price_syp must be a positive integer');
      }

      const parsed = BigInt(normalized);
      if (parsed <= 0n) {
        throw new BadRequestException('final_price_syp must be greater than 0');
      }

      return parsed;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('final_price_syp must be a positive integer');
    }
  }

  private async rephraseWithLlm(params: {
    sourceText: string;
    language: AdvisorExplainLanguage;
    apiKey: string;
  }): Promise<string> {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const masked = this.maskNumbers(params.sourceText);
    const languageHint =
      params.language === 'en'
        ? 'English'
        : params.language === 'ar'
          ? 'Arabic (MSA)'
          : 'Arabic (Syrian dialect)';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'Rewrite the text for clarity only. Never compute or alter numbers. Keep all __N#__ tokens unchanged. Return plain text only.',
          },
          {
            role: 'user',
            content: `Language: ${languageHint}\nText: ${masked.text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed with status ${response.status}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('OpenAI response is empty');
    }

    if (!masked.tokens.every((token) => content.includes(token))) {
      throw new Error('OpenAI response missed numeric placeholders');
    }

    return this.unmaskNumbers(content, masked.valuesByToken);
  }

  private maskNumbers(text: string): {
    text: string;
    tokens: string[];
    valuesByToken: Record<string, string>;
  } {
    let index = 0;
    const valuesByToken: Record<string, string> = {};
    const tokens: string[] = [];
    const maskedText = text.replace(/\d[\d,]*/g, (raw) => {
      index += 1;
      const token = `__N${index}__`;
      valuesByToken[token] = raw;
      tokens.push(token);
      return token;
    });

    return {
      text: maskedText,
      tokens,
      valuesByToken,
    };
  }

  private unmaskNumbers(
    text: string,
    valuesByToken: Record<string, string>,
  ): string {
    return Object.entries(valuesByToken).reduce(
      (acc, [token, value]) => acc.replaceAll(token, value),
      text,
    );
  }

  private resolvePpm2Syp(row: MarketInsightRow): number | null {
    const direct = Number(row.price_per_m2_syp ?? 0);
    if (Number.isFinite(direct) && direct > 0) {
      return direct;
    }

    const area = Number(row.area_m2 ?? 0);
    if (!Number.isFinite(area) || area <= 0) {
      return null;
    }

    const syp = Number(row.price_syp ?? 0);
    if (Number.isFinite(syp) && syp > 0) {
      return syp / area;
    }

    const usd = Number(row.price_usd ?? 0);
    const fx = Number(row.fx_usd_to_syp ?? 0);
    if (Number.isFinite(usd) && usd > 0 && Number.isFinite(fx) && fx > 0) {
      return (usd * fx) / area;
    }

    return null;
  }

  private computeMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private computePercentile(values: number[], target: number): number {
    const belowOrEqual = values.filter((value) => value <= target).length;
    return (belowOrEqual / values.length) * 100;
  }

  private resolveSuggestedPpm2(params: {
    suggested_price_syp?: number;
    area_m2?: number;
  }): number | null {
    if (!Number.isFinite(Number(params.suggested_price_syp))) {
      return null;
    }
    const suggested = Number(params.suggested_price_syp);
    if (suggested <= 0) {
      return null;
    }
    if (Number.isFinite(Number(params.area_m2)) && Number(params.area_m2) > 0) {
      return suggested / Number(params.area_m2);
    }
    return suggested;
  }

  private computeTrendLast30Days(points: Array<{ ppm2: number; created_at: Date }>): {
    direction: 'up' | 'down' | 'flat';
    change_ratio: number;
  } {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const last30 = points.filter((point) => point.created_at >= cutoff);
    const source = last30.length >= 6 ? last30 : points;
    const chunk = Math.max(1, Math.floor(source.length / 2));
    const first = source.slice(0, chunk);
    const last = source.slice(source.length - chunk);
    const avgFirst = first.reduce((sum, item) => sum + item.ppm2, 0) / first.length;
    const avgLast = last.reduce((sum, item) => sum + item.ppm2, 0) / last.length;
    const ratio = avgFirst > 0 ? (avgLast - avgFirst) / avgFirst : 0;

    if (ratio > 0.03) {
      return { direction: 'up', change_ratio: ratio };
    }
    if (ratio < -0.03) {
      return { direction: 'down', change_ratio: ratio };
    }
    return { direction: 'flat', change_ratio: ratio };
  }

  private mapInsightsLanguage(language: ReturnType<typeof detectAdvisorLanguage>): 'ar_sy' | 'ar' | 'en' {
    if (language === 'en') {
      return 'en';
    }
    if (language === 'msa') {
      return 'ar';
    }
    return 'ar_sy';
  }

  private buildInsightsMessage(params: {
    language: 'ar_sy' | 'ar' | 'en';
    trend: { direction: 'up' | 'down' | 'flat'; change_ratio: number };
    volatility: number;
    sampleCount: number;
  }): string {
    const trendPercent = `${(params.trend.change_ratio * 100).toFixed(1)}%`;
    const volatilityPercent = `${(params.volatility * 100).toFixed(1)}%`;

    if (params.language === 'en') {
      return `Market trend is ${params.trend.direction} (${trendPercent}) with volatility ${volatilityPercent} from ${params.sampleCount} samples.`;
    }
    if (params.language === 'ar') {
      return `اتجاه السوق ${params.trend.direction === 'up' ? 'صاعد' : params.trend.direction === 'down' ? 'هابط' : 'مستقر'} (${trendPercent}) مع تذبذب ${volatilityPercent} اعتمادًا على ${params.sampleCount} عينة.`;
    }
    return `اتجاه السوق ${params.trend.direction === 'up' ? 'عم يطلع' : params.trend.direction === 'down' ? 'عم ينزل' : 'شبه ثابت'} (${trendPercent}) والتذبذب ${volatilityPercent} من ${params.sampleCount} عينة.`;
  }

  private resolveInvestmentPriceGap(params: {
    askPrice: number;
    estimatedPrice: number;
  }): number {
    if (!Number.isFinite(params.estimatedPrice) || params.estimatedPrice <= 0) {
      return 0;
    }

    const ratio = (params.estimatedPrice - params.askPrice) / params.estimatedPrice;
    return Math.max(0, Math.min(1, 0.5 + ratio));
  }

  private buildInvestmentAdvice(params: {
    evaluation: AdvisorInvestmentAnalysisResponse['evaluation'];
    marketStatus: AdvisorInvestmentAnalysisResponse['market_status'];
    confidence: AdvisorInvestmentAnalysisResponse['confidence'];
  }): string {
    const pricingText =
      params.evaluation === 'underpriced'
        ? 'The property appears below current market value'
        : params.evaluation === 'overpriced'
          ? 'The property is priced above the current market level'
          : 'The property is priced close to the current market level';

    const marketText =
      params.marketStatus === 'HOT'
        ? 'Demand in this district is strong'
        : params.marketStatus === 'UNDERVALUED'
          ? 'This district still looks undervalued relative to the city'
          : 'This district is trading around the city average';

    const confidenceText =
      params.confidence === 'HIGH'
        ? 'and the comparable coverage is strong.'
        : params.confidence === 'MEDIUM'
          ? 'with a decent comparable sample.'
          : params.confidence === 'LOW'
            ? 'but the comparable sample is limited.'
            : 'and the estimate should be treated cautiously because comparables are sparse.';

    return `${pricingText}. ${marketText}, ${confidenceText}`;
  }

  private downgradeSaleSpeed(
    speed: AdvisorSimulationResponse['sale_speed_class'],
  ): AdvisorSimulationResponse['sale_speed_class'] {
    const order: AdvisorSimulationResponse['sale_speed_class'][] = [
      'fast',
      'normal',
      'slow',
      'very_slow',
    ];
    const idx = order.indexOf(speed);
    if (idx < 0 || idx >= order.length - 1) {
      return speed;
    }
    return order[idx + 1];
  }

  private buildSimulationMessage(params: {
    deviationPercent: number;
    saleSpeed: AdvisorSimulationResponse['sale_speed_class'];
    riskScore: number;
  }): string {
    const deviationText = `${params.deviationPercent.toFixed(1)}%`;
    const riskText = `${(params.riskScore * 100).toFixed(1)}%`;
    const speedText =
      params.saleSpeed === 'fast'
        ? 'سريع'
        : params.saleSpeed === 'normal'
          ? 'طبيعي'
          : params.saleSpeed === 'slow'
            ? 'بطيء'
            : 'بطيء جدًا';
    return `المحاكاة: الانحراف عن الوسيط ${deviationText}، مستوى المخاطر ${riskText}، وسرعة البيع المتوقعة ${speedText}.`;
  }
}
