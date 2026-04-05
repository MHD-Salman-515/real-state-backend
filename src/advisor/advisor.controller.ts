import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AdvisorService } from './advisor.service';
import { SellerPriceDto } from './dto/seller-price.dto';
import { BuyerEvaluateDto } from './dto/buyer-evaluate.dto';
import { ExplainDto } from './dto/explain.dto';
import { TrackOutcomeDto } from './dto/track-outcome.dto';
import { SimulateDto } from './dto/simulate.dto';
import { EvaluateMarketDto } from './dto/evaluate-market.dto';
import { InvestmentAnalysisDto } from './dto/investment-analysis.dto';
import {
  AdvisorExplainResponse,
  AdvisorInsightsResponse,
  AdvisorAnalyticsResponse,
  AdvisorEvaluateResponse,
  AdvisorInvestmentAnalysisResponse,
  AdvisorSimulationResponse,
  AdvisorTrackResponse,
  BuyerEvaluateResponse,
  SellerPriceResponse,
} from './advisor.types';
import { AdvisorLoggingInterceptor } from './advisor-logging.interceptor';

@ApiTags('advisor')
@UseGuards(OptionalJwtAuthGuard, ThrottlerGuard)
// @nestjs/throttler v6 uses milliseconds for ttl: 60_000 ms = 1 minute.
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@UseInterceptors(AdvisorLoggingInterceptor)
@Controller('advisor')
export class AdvisorController {
  constructor(private readonly advisorService: AdvisorService) {}

  @Post('seller-price')
  @ApiOperation({ summary: 'Get deterministic seller price suggestion' })
  @ApiBody({
    type: SellerPriceDto,
    examples: {
      apartmentDamascus: {
        value: {
          city: 'damascus',
          district: 'mazzeh',
          property_type: 'apartment',
          area_m2: 140,
          user_message: 'I want to sell quickly but fairly priced.',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Seller pricing recommendation',
    schema: {
      example: {
        optimal_price_syp: 1798160000,
        optimal_range_syp: { min: 1708252000, max: 1888068000 },
        fast_sale_price_syp: 1659840000,
        fast_sale_range_syp: { min: 1576848000, max: 1742832000 },
        confidence: 0.84,
        summary: 'Suggested optimal and fast-sale prices.',
        fx_used: 14000,
        citations: {
          area_key: 'damascus|mazzeh|apartment',
          sample_count: 54,
          updated_at: '2026-03-03T09:00:00.000Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request or missing baseline data' })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      forbidUnknownValues: true,
    }),
  )
  async sellerPrice(
    @Body() dto: SellerPriceDto,
  ): Promise<SellerPriceResponse> {
    return this.advisorService.getSellerPriceSuggestion(dto);
  }

  @Post('buyer-evaluate')
  @ApiOperation({ summary: 'Evaluate buyer ask price against fair range' })
  @ApiBody({
    type: BuyerEvaluateDto,
    examples: {
      askInSyp: {
        value: {
          city: 'damascus',
          district: 'mazzeh',
          property_type: 'apartment',
          area_m2: 120,
          ask_price_syp: 1650000000,
          user_message: 'Is this listing overpriced for this neighborhood?',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Buyer evaluation result',
    schema: {
      example: {
        verdict: 'fair',
        ask_price_syp: 1650000000,
        fair_range_syp: { min: 1534500000, max: 1765500000 },
        confidence: 0.84,
        summary: 'This ask is in a fair range for the area.',
        fx_used: 14000,
        citations: {
          area_key: 'damascus|mazzeh|apartment',
          sample_count: 54,
          updated_at: '2026-03-03T09:00:00.000Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request or missing baseline data' })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      forbidUnknownValues: true,
    }),
  )
  async buyerEvaluate(
    @Body() dto: BuyerEvaluateDto,
  ): Promise<BuyerEvaluateResponse> {
    return this.advisorService.buyerEvaluate(dto);
  }

  @Post('evaluate')
  @ApiOperation({ summary: 'Evaluate a property using comparable market_data rows from housing_db' })
  @ApiBody({
    type: EvaluateMarketDto,
    examples: {
      marketEvaluate: {
        value: {
          city: 'دمشق',
          district: 'المزة',
          property_type: 'شقة',
          area_m2: 120,
          bedrooms: 3,
          ask_price: 135000,
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Comparable-based market valuation',
    schema: {
      example: {
        estimated_price: 118000,
        average_price_per_m2: 1003.14,
        median_price_per_m2: 980,
        comparables_found: 24,
        selected_comparables: 20,
        evaluation: 'overpriced',
        difference_percent: 14.41,
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid payload or not enough comparable properties found' })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      forbidUnknownValues: true,
    }),
  )
  async evaluate(
    @Body() dto: EvaluateMarketDto,
  ): Promise<AdvisorEvaluateResponse> {
    return this.advisorService.evaluateMarketPrice(dto);
  }

  @Post('investment-analysis')
  @ApiOperation({ summary: 'Market-based investment analysis using current valuation engine and district stats' })
  @ApiBody({
    type: InvestmentAnalysisDto,
    examples: {
      investmentCase: {
        value: {
          city: 'دمشق',
          district: 'المزة',
          property_type: 'شقة',
          area_m2: 120,
          ask_price: 135000,
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Investment analysis summary',
    schema: {
      example: {
        estimated_price: 132955,
        evaluation: 'fair_price',
        confidence: 'HIGH',
        difference_percent: 1.54,
        investment_score: 8.3,
        market_status: 'HOT',
        advice:
          'The property is priced close to the current market level. Demand in this district is strong, which supports a solid investment case.',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid payload for investment analysis' })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      forbidUnknownValues: true,
    }),
  )
  async investmentAnalysis(
    @Body() dto: InvestmentAnalysisDto,
  ): Promise<AdvisorInvestmentAnalysisResponse> {
    return this.advisorService.investmentAnalysis(dto);
  }

  @Get('similar')
  @ApiOperation({ summary: 'Get top similar comparable properties from housing_db.market_data' })
  @ApiQuery({ name: 'city', required: true, example: 'دمشق' })
  @ApiQuery({ name: 'district', required: false, example: 'المزة' })
  @ApiQuery({ name: 'property_type', required: true, example: 'شقة' })
  @ApiQuery({ name: 'area_m2', required: true, example: 120 })
  @ApiQuery({ name: 'bedrooms', required: false, example: 3 })
  @ApiOkResponse({ description: 'Ranked comparable properties' })
  async similar(
    @Query('city') city?: string,
    @Query('district') district?: string,
    @Query('property_type') propertyType?: string,
    @Query('area_m2') areaM2?: string,
    @Query('bedrooms') bedrooms?: string,
  ) {
    if (!city || !city.trim() || !propertyType || !propertyType.trim()) {
      throw new BadRequestException('city and property_type are required');
    }

    const parsedArea = Number(areaM2);
    if (!Number.isFinite(parsedArea) || parsedArea <= 0) {
      throw new BadRequestException('area_m2 must be a positive number');
    }

    const parsedBedrooms =
      bedrooms == null || bedrooms === '' ? undefined : Number(bedrooms);
    if (
      parsedBedrooms != null &&
      (!Number.isFinite(parsedBedrooms) || parsedBedrooms < 0)
    ) {
      throw new BadRequestException('bedrooms must be a non-negative number');
    }

    return this.advisorService.getSimilarComparables({
      city: city.trim(),
      district: district?.trim() || undefined,
      property_type: propertyType.trim(),
      area_m2: parsedArea,
      bedrooms: parsedBedrooms,
    });
  }

  @Post('explain')
  @ApiOperation({ summary: 'Rephrase advisor outcome without changing numbers' })
  @ApiBody({
    type: ExplainDto,
    examples: {
      sellerExplain: {
        value: {
          mode: 'seller',
          user_message: 'بدي شرح بسيط',
          result: {
            optimal_price_syp: 1798160000,
            optimal_range_syp: { min: 1708252000, max: 1888068000 },
            fast_sale_price_syp: 1659840000,
            fast_sale_range_syp: { min: 1576848000, max: 1742832000 },
            confidence: 0.84,
            fx_used: 14000,
            citations: { area_key: 'damascus|mazzeh|apartment', sample_count: 54 },
          },
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Natural-language explanation',
    schema: {
      example: {
        text: 'السعر الأفضل للعرض ...',
        language: 'ar_sy',
      },
    },
  })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      forbidUnknownValues: true,
    }),
  )
  async explain(@Body() dto: ExplainDto): Promise<AdvisorExplainResponse> {
    return this.advisorService.explain(dto);
  }

  @Post('track')
  @ApiOperation({ summary: 'Track pricing outcome action without PII' })
  @ApiBody({
    type: TrackOutcomeDto,
    examples: {
      acceptedOptimal: {
        value: {
          log_id: '12345',
          action: 'accepted_optimal',
          final_price_syp: 1798160000,
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Outcome stored successfully',
    schema: {
      example: {
        id: '1',
        log_id: '12345',
        action: 'accepted_optimal',
        final_price_syp: '1798160000',
      },
    },
  })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      forbidUnknownValues: true,
    }),
  )
  async track(
    @Body() dto: TrackOutcomeDto,
    @Req() req?: { user?: { sub?: number | string; id?: number | string; role?: string } },
  ): Promise<AdvisorTrackResponse> {
    const ownerId = this.resolveOwnerId(req?.user);
    return this.advisorService.trackOutcome(dto, ownerId);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Advisor analytics (no PII)' })
  @ApiQuery({
    name: 'days',
    required: false,
    description: 'Window in days (integer 1..90). Defaults to 7.',
    example: 7,
  })
  @ApiOkResponse({
    description: 'Aggregated advisor suggestion/outcome metrics',
    schema: {
      example: {
        days: 7,
        totals: {
          suggestions: 128,
          outcomes: 51,
        },
        outcomes: {
          accepted_optimal: 20,
          accepted_fast: 9,
          edited: 14,
          ignored: 6,
          other: 2,
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'days must be an integer between 1 and 90' })
  async analytics(
    @Query('days') days?: string,
  ): Promise<AdvisorAnalyticsResponse> {
    const resolvedDays = days == null || days === '' ? 7 : Number(days);
    if (!Number.isInteger(resolvedDays) || resolvedDays < 1 || resolvedDays > 90) {
      throw new BadRequestException('days must be an integer between 1 and 90');
    }

    return this.advisorService.getAnalytics(resolvedDays);
  }

  @Get('insights')
  @ApiOperation({ summary: 'Smart market insights from non-outlier data' })
  @ApiQuery({ name: 'city', required: true, example: 'damascus' })
  @ApiQuery({ name: 'district', required: false, example: 'mazzeh' })
  @ApiQuery({ name: 'property_type', required: false, example: 'apartment' })
  @ApiQuery({ name: 'days_window', required: false, example: 90 })
  @ApiQuery({
    name: 'suggested_price_syp',
    required: false,
    description: 'Suggested price total (or ppm2 if area_m2 is omitted)',
    example: 1800000000,
  })
  @ApiQuery({
    name: 'area_m2',
    required: false,
    description: 'Used with suggested_price_syp to compute percentile',
    example: 140,
  })
  @ApiQuery({
    name: 'user_message',
    required: false,
    description: 'Optional text for language detection of the message',
  })
  @ApiOkResponse({
    description: 'Computed deterministic insights',
    schema: {
      example: {
        area_scope: { city: 'damascus', district: 'mazzeh', property_type: 'apartment' },
        days_window: 90,
        sample_count: 132,
        stats: {
          median_ppm2_syp: 12250000,
          avg_ppm2_syp: 12590000,
          min_ppm2_syp: 9100000,
          max_ppm2_syp: 17800000,
          volatility_index: 0.12,
          trend_last_30_days: { direction: 'up', change_ratio: 0.04 },
          suggested_percentile: 61.3,
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'city is required and days_window must be an integer between 1 and 365',
  })
  async insights(
    @Query('city') city?: string,
    @Query('district') district?: string,
    @Query('property_type') propertyType?: string,
    @Query('days_window') daysWindow?: string,
    @Query('suggested_price_syp') suggestedPriceSyp?: string,
    @Query('area_m2') areaM2?: string,
    @Query('user_message') userMessage?: string,
  ): Promise<AdvisorInsightsResponse> {
    if (!city || !city.trim()) {
      throw new BadRequestException('city is required');
    }

    const resolvedDays = daysWindow == null || daysWindow === '' ? 90 : Number(daysWindow);
    if (!Number.isInteger(resolvedDays) || resolvedDays < 1 || resolvedDays > 365) {
      throw new BadRequestException('days_window must be an integer between 1 and 365');
    }

    const suggested =
      suggestedPriceSyp == null || suggestedPriceSyp === ''
        ? undefined
        : Number(suggestedPriceSyp);
    if (suggested != null && (!Number.isFinite(suggested) || suggested <= 0)) {
      throw new BadRequestException('suggested_price_syp must be a positive number');
    }

    const parsedArea = areaM2 == null || areaM2 === '' ? undefined : Number(areaM2);
    if (parsedArea != null && (!Number.isFinite(parsedArea) || parsedArea <= 0)) {
      throw new BadRequestException('area_m2 must be a positive number');
    }

    return this.advisorService.getInsights({
      city: city.trim(),
      district: district?.trim() || undefined,
      property_type: propertyType?.trim() || undefined,
      days_window: resolvedDays,
      suggested_price_syp: suggested,
      area_m2: parsedArea,
      user_message: userMessage?.trim() || undefined,
    });
  }

  @Post('simulate')
  @ApiOperation({ summary: 'Deterministic market simulation for proposed price' })
  @ApiBody({
    type: SimulateDto,
    examples: {
      defaultCase: {
        value: {
          city: 'damascus',
          district: 'mazzeh',
          property_type: 'apartment',
          area_m2: 140,
          proposed_price_syp: 1800000000,
          days_window: 90,
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Simulation result with risk and sale speed class',
  })
  @ApiBadRequestResponse({ description: 'Invalid simulation payload' })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      forbidUnknownValues: true,
    }),
  )
  async simulate(@Body() dto: SimulateDto): Promise<AdvisorSimulationResponse> {
    return this.advisorService.simulate(dto);
  }

  private resolveOwnerId(user?: {
    sub?: number | string;
    id?: number | string;
    role?: string;
  }): number | undefined {
    if (!user) {
      return undefined;
    }
    if (String(user.role || '').toUpperCase() !== 'OWNER') {
      return undefined;
    }

    const parsed = Number(user.sub ?? user.id);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return undefined;
    }

    return parsed;
  }
}
