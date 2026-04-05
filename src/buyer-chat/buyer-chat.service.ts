import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildExplainTrace } from '../advisor/explanation/explain-trace.helper';
import { buildBuyerSearchReply } from '../chat-ux/templates';
import { PrismaService } from '../prisma/prisma.service';
import {
  detectBuyerChatIntent,
  parseBuyerSearch,
  type BuyerChatIntent,
} from './buyer-chat.intent';
import { PropertyRankingService } from './ranking/property-ranking.service';
import { AdvisorService } from '../advisor/advisor.service';
import { MarketTrendService } from '../market-intelligence/market-trend.service';
import {
  buildAcknowledgementReply,
  buildConfirmationReply,
  buildOutOfScopeReply,
  buildRealEstateConceptReply,
  buildRealEstateGreetingReply,
  buildUnknownRealEstateReply,
  classifyRealEstateRequest,
  extractComparisonTargets,
  type RealEstateAssistantIntent,
  type RealEstateLanguage,
} from '../chat-ux/real-estate-domain';
import { buildBuyerEvaluateReply, buildMarketTrendReply } from '../chat-ux/templates';
import { AiService } from '../ai/ai.service';
import {
  ChatAdvisorIntent,
  ChatIntentService,
} from '../chat/chat-intent.service';
import { MarketStatsService } from '../market-intelligence/market-stats.service';

type RecommendedProperty = {
  id: number;
  title: string;
  city: string;
  address: string | null;
  area: number | null;
  price: number | null;
  type: string;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type BuyerQueryState = {
  city: string;
  district?: string;
  property_type: 'APARTMENT' | 'HOUSE' | 'VILLA' | 'STUDIO' | 'LAND';
  area_m2?: number;
  budget_syp?: number;
};

type BuyerSortMode = 'SCORE_DESC' | 'PRICE_ASC';

type BuyerDispatchResult = {
  intent: BuyerChatIntent;
  text: string;
  payloadJson: Record<string, unknown>;
  queryState?: BuyerQueryState;
  sortMode?: BuyerSortMode;
  propertyState?: Record<string, unknown>;
};

type AssistantTurnContext = {
  content: string;
  payloadJson: Record<string, unknown> | null;
} | null;

@Injectable()
export class BuyerChatService {
  private readonly logger = new Logger(BuyerChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly propertyRankingService: PropertyRankingService,
    private readonly advisorService: AdvisorService,
    private readonly marketTrendService: MarketTrendService,
    private readonly aiService: AiService,
    private readonly chatIntentService: ChatIntentService,
    private readonly marketStatsService: MarketStatsService,
  ) {}

  async createSession(params: { buyerId: number; title?: string }) {
    const buyerId = this.validateBuyerId(params.buyerId);
    const sessionDelegate = (this.prisma as any).buyerChatSession;
    const created = await sessionDelegate.create({
      data: {
        buyerId,
        title: String(params.title || '').trim() || null,
        metaJson: null,
      },
      select: {
        id: true,
        buyerId: true,
        title: true,
        createdAt: true,
      },
    });

    return {
      id: created.id,
      buyerId: created.buyerId,
      title: created.title,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async listSessions(params: { buyerId: number; limit: number }) {
    const buyerId = this.validateBuyerId(params.buyerId);
    const limit = this.validateLimit(params.limit, 1, 100, 20);

    const sessionDelegate = (this.prisma as any).buyerChatSession;
    const rows = await sessionDelegate.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async listMessages(params: { buyerId: number; sessionId: number; limit: number }) {
    const session = await this.assertBuyerSession(params.buyerId, params.sessionId);
    const limit = this.validateLimit(params.limit, 1, 200, 50);

    const messageDelegate = (this.prisma as any).buyerChatMessage;
    const rows = await messageDelegate.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        intent: true,
        payloadJson: true,
        createdAt: true,
      },
    });

    return {
      sessionId: session.id,
      items: rows.map((row) => this.serializeMessage(row)),
    };
  }

  async sendMessage(params: {
    buyerId: number;
    sessionId: number;
    message: string;
  }) {
    const session = await this.assertBuyerSession(params.buyerId, params.sessionId);
    const message = String(params.message || '').trim();
    if (!message || message.length < 1 || message.length > 2000) {
      throw new BadRequestException('message must be between 1 and 2000 characters');
    }

    const messageDelegate = (this.prisma as any).buyerChatMessage;
    const userMsg = await messageDelegate.create({
      data: {
        sessionId: session.id,
        role: 'USER',
        content: message,
        intent: 'USER_INPUT',
        payloadJson: null,
      },
      select: {
        id: true,
        role: true,
        content: true,
        intent: true,
        payloadJson: true,
        createdAt: true,
      },
    });

    const sessionMeta = this.toRecord(session.metaJson) || {};
    const lastQuery = this.toRecord(sessionMeta.last_query);
    const lastProperty = this.toRecord(sessionMeta.last_property);
    const lastSort = this.normalizeSortMode(sessionMeta.last_sort);
    const lastAssistant = await this.getLatestAssistantMessage(session.id);
    const messagePropertyExtract = await this.chatIntentService.extractPropertyData(
      message,
      null,
    );
    const messagePropertyState = this.hasSubstantivePropertyState(messagePropertyExtract)
      ? this.mergePropertyState(lastProperty, messagePropertyExtract)
      : undefined;
    const dispatch = await this.dispatchBuyerIntent({
      message,
      lastQuery,
      lastProperty,
      lastSort,
      lastAssistant,
    });

    const assistant = await messageDelegate.create({
      data: {
        sessionId: session.id,
        role: 'ASSISTANT',
        content: dispatch.text,
        intent: dispatch.intent,
        payloadJson: dispatch.payloadJson,
      },
      select: {
        id: true,
        role: true,
        content: true,
        intent: true,
        payloadJson: true,
        createdAt: true,
      },
    });

    await this.persistRecommendationLog({
      buyerId: params.buyerId,
      sessionId: session.id,
      intent: dispatch.intent,
      payloadJson: dispatch.payloadJson,
    });

    await this.persistLastQueryState({
      sessionId: session.id,
      existingMeta: session.metaJson ?? null,
      queryState: dispatch.queryState,
      propertyState: dispatch.propertyState ?? messagePropertyState,
      sortMode: dispatch.sortMode,
    });

    return {
      sessionId: session.id,
      assistantMessage: assistant.content,
      payloadJson: assistant.payloadJson ?? null,
      messagesTail: [this.serializeMessage(userMsg), this.serializeMessage(assistant)],
    };
  }

  async getRecommendations(params: {
    city?: string;
    district?: string;
    property_type?: string;
    area_m2?: number;
    budget_syp?: number;
    limit?: number;
    days?: number;
  }) {
    const limit = this.validateLimit(params.limit ?? 5, 1, 20, 5);
    const propertyType = this.normalizePropertyType(params.property_type);
    const parsed = {
      city: this.cleanString(params.city) || 'damascus',
      district: params.district,
      property_type: propertyType,
      area_m2: params.area_m2,
      budget: params.budget_syp,
    };
    const days = Number.isInteger(params.days) && Number(params.days) > 0 ? Number(params.days) : 30;
    const stableQuery = this.buildStableQuery(parsed);

    const candidates = await this.findProperties(parsed, limit * 3);
    const ranked = await this.propertyRankingService.rankProperties(
      {
        city: parsed.city,
        district: parsed.district,
        property_type: parsed.property_type,
        area_m2: parsed.area_m2,
        budget_syp: parsed.budget,
        days,
      },
      candidates,
    );
    const top = ranked.slice(0, limit);
    const marketContext = this.extractMarketContext(top);

    return {
      items: top.map((item) => ({
        ...this.serializeProperty(item.property),
        score: item.score,
        reasons: item.reasons,
        why_short: this.buildWhyShort(item),
      })),
      ranking_weights: this.propertyRankingService.getWeights(),
      query: stableQuery,
      ranking: {
        weights: this.propertyRankingService.getWeights(),
        days,
      },
      ...(marketContext ? { market_context: marketContext } : {}),
    };
  }

  private async dispatchBuyerIntent(params: {
    message: string;
    lastQuery: Record<string, unknown> | null;
    lastProperty: Record<string, unknown> | null;
    lastSort: BuyerSortMode;
    lastAssistant: AssistantTurnContext;
  }): Promise<BuyerDispatchResult> {
    const domain = classifyRealEstateRequest({
      message: params.message,
      hasRealEstateContext: Boolean(params.lastQuery || params.lastAssistant),
      contextHints: [
        ...(params.lastQuery ? [JSON.stringify(params.lastQuery)] : []),
        ...(params.lastAssistant?.content ? [params.lastAssistant.content] : []),
      ],
    });

    if (domain.domain === 'OUT_OF_SCOPE') {
      const fallbackText = buildOutOfScopeReply(domain.language);
      return {
        intent: 'OUT_OF_SCOPE',
        text: await this.composeBuyerReply({
          mode: 'OUT_OF_SCOPE',
          language: domain.language,
          userMessage: params.message,
          draft: fallbackText,
          facts: {
            redirect_topics:
              domain.language === 'ar'
                ? ['شراء العقارات', 'بيع العقارات', 'التسعير', 'تحليل السوق']
                : ['buying', 'selling', 'pricing', 'market analysis'],
          },
        }),
        payloadJson: {
          domain: domain.domain,
          suggested_actions: [
            {
              type: 'REDIRECT_REAL_ESTATE',
              label: domain.language === 'ar' ? 'اسألني عن العقارات' : 'Ask me about real estate',
            },
          ],
        },
      };
    }

    if (domain.intent === 'GREETING_REAL_ESTATE' || domain.intent === 'SMALL_TALK_ALLOWED') {
      const greetingText = buildRealEstateGreetingReply(domain.language);
      return {
        intent: 'GREETING_REAL_ESTATE',
        text: await this.composeBuyerReply({
          mode: 'GREETING',
          language: domain.language,
          userMessage: params.message,
          draft: greetingText,
          facts: {
            allowed_topics:
              domain.language === 'ar'
                ? ['شراء', 'بيع', 'إيجار', 'تسعير', 'استثمار']
                : ['buy', 'sell', 'rent', 'pricing', 'investment'],
          },
        }),
        payloadJson: {
          domain: domain.domain,
          suggested_actions: this.buildStarterSuggestions(domain.language),
        },
      };
    }

    if (domain.intent === 'ACKNOWLEDGEMENT') {
      return {
        intent: 'GREETING_REAL_ESTATE',
        text: buildAcknowledgementReply(domain.language),
        payloadJson: {
          domain: domain.domain,
          conversational_intent: domain.intent,
        },
      };
    }

    if (domain.intent === 'CONFIRMATION_YES' || domain.intent === 'CONFIRMATION_NO') {
      return {
        intent: 'FOLLOW_UP_CONTEXTUAL',
        text: buildConfirmationReply({
          language: domain.language,
          confirmed: domain.intent === 'CONFIRMATION_YES',
          hasActionableContext: this.lastAssistantAskedQuestion(params.lastAssistant),
        }),
        payloadJson: {
          domain: domain.domain,
          conversational_intent: domain.intent,
          follow_up_to: params.lastAssistant?.content || null,
        },
      };
    }

    if (domain.needsClarification && domain.clarificationQuestion) {
      return {
        intent: 'FALLBACK',
        text: domain.clarificationQuestion,
        payloadJson: {
          domain: domain.domain,
          recovered_intent: domain.intent,
          needs_clarification: true,
          suggested_actions: this.buildStarterSuggestions(domain.language),
        },
      };
    }

    const advisorIntent = this.chatIntentService.detectIntent(params.message);
    this.logger.debug(
      `[buyer-chat] detected_intent advisor=${advisorIntent} domain=${domain.intent} route_precheck`,
    );
    if (
      advisorIntent === 'PROPERTY_EVALUATION' ||
      advisorIntent === 'INVESTMENT_ANALYSIS' ||
      advisorIntent === 'MARKET_HEATMAP'
    ) {
      const advisorReply = await this.handleAdvisorChatIntent({
        message: params.message,
        language: domain.language,
        intent: advisorIntent,
        lastProperty: this.shouldReusePropertyState(params.message, params.lastAssistant)
          ? params.lastProperty
          : null,
      });
      if (advisorReply) {
        return advisorReply;
      }
    }

    const intent = detectBuyerChatIntent(params.message, {
      hasLastQuery: Boolean(params.lastQuery),
    });
    if (intent === 'BUYER_REFINE' && params.lastQuery) {
      const refined = this.applyRefinement(params.message, params.lastQuery, params.lastSort);
      this.logger.debug('[buyer-chat] selected_route=legacy_refine');
      return this.runSearchFromQuery({
        query: refined.query,
        sortMode: refined.sortMode,
        mode: 'refine',
      });
    }

    if (
      domain.intent === 'PROPERTY_SEARCH' ||
      domain.intent === 'PROPERTY_RECOMMENDATION' ||
      (domain.intent === 'INVESTMENT_ADVICE' && this.isRecommendationLikeMessage(params.message))
    ) {
      const parsed = parseBuyerSearch(params.message);
      const parsedForSearch = {
        city: this.cleanString(parsed.city) || this.asOptionalString(params.lastQuery?.city) || 'damascus',
        district: parsed.district || this.asOptionalString(params.lastQuery?.district),
        property_type:
          this.normalizePropertyType(parsed.property_type) ||
          this.normalizePropertyType(this.asOptionalString(params.lastQuery?.property_type)) ||
          'APARTMENT',
        area_m2: parsed.area_m2 ?? this.toPositiveNumber(params.lastQuery?.area_m2),
        budget: parsed.budget ?? this.toPositiveNumber(params.lastQuery?.budget_syp),
      };
      const stableQuery = this.buildStableQuery(parsedForSearch);
      this.logger.debug('[buyer-chat] selected_route=legacy_search');
      return this.runSearchFromQuery({
        query: stableQuery,
        sortMode: 'SCORE_DESC',
        mode: domain.intent === 'PROPERTY_SEARCH' ? 'find' : 'recommend',
      });
    }

    if (intent !== 'FIND_PROPERTIES') {
      return this.handleGeneralRealEstateIntent({
        message: params.message,
        lastQuery: params.lastQuery,
        language: domain.language,
        intent: domain.intent,
      });
    }

    const parsed = parseBuyerSearch(params.message);
    const parsedForSearch = {
      city: this.cleanString(parsed.city) || 'damascus',
      district: parsed.district,
      property_type: this.normalizePropertyType(parsed.property_type),
      area_m2: parsed.area_m2,
      budget: parsed.budget,
    };
    const stableQuery = this.buildStableQuery(parsedForSearch);
    this.logger.debug('[buyer-chat] selected_route=legacy_find');
    return this.runSearchFromQuery({
      query: stableQuery,
      sortMode: 'SCORE_DESC',
      mode: 'find',
    });
  }

  private async handleGeneralRealEstateIntent(params: {
    message: string;
    lastQuery: Record<string, unknown> | null;
    language: RealEstateLanguage;
    intent: RealEstateAssistantIntent;
  }): Promise<BuyerDispatchResult> {
    if (params.intent === 'AREA_COMPARISON') {
      return this.handleAreaComparisonIntent(params.message, params.language);
    }

    if (params.intent === 'MARKET_ANALYSIS') {
      return this.handleMarketAnalysisIntent(params.message, params.lastQuery, params.language);
    }

    if (params.intent === 'PRICE_ESTIMATION') {
      return this.handlePriceEstimationIntent(params.message, params.lastQuery, params.language);
    }

    if (
      params.intent === 'INVESTMENT_ADVICE' ||
      params.intent === 'RENTAL_GUIDANCE' ||
      params.intent === 'BUYER_GUIDANCE' ||
      params.intent === 'FOLLOW_UP_CONTEXTUAL' ||
      params.intent === 'PROPERTY_DETAILS'
    ) {
      return this.handleGuidanceIntent(params.message, params.lastQuery, params.language, params.intent);
    }

    if (params.intent === 'REAL_ESTATE_FAQ') {
      const text = buildRealEstateConceptReply(params.message, params.language);
      return {
        intent: 'REAL_ESTATE_FAQ',
        text: await this.composeBuyerReply({
          mode: 'REAL_ESTATE_FAQ',
          language: params.language,
          userMessage: params.message,
          draft: text,
          facts: {
            topic: params.message,
          },
        }),
        payloadJson: {
          domain: 'IN_SCOPE_REAL_ESTATE',
          suggested_actions: this.buildStarterSuggestions(params.language),
        },
      };
    }

    return {
      intent: 'FALLBACK',
      text: buildUnknownRealEstateReply(params.language),
      payloadJson: {
        domain: 'IN_SCOPE_REAL_ESTATE',
        suggested_actions: this.buildStarterSuggestions(params.language),
      },
    };
  }

  private async handleAdvisorChatIntent(params: {
    message: string;
    language: RealEstateLanguage;
    intent: ChatAdvisorIntent;
    lastProperty: Record<string, unknown> | null;
  }): Promise<BuyerDispatchResult | null> {
    const extracted = await this.chatIntentService.extractPropertyData(
      params.message,
      params.lastProperty,
    );
    const mergedPropertyState = this.mergePropertyState(params.lastProperty, extracted);
    this.logger.debug(
      `[buyer-chat] extracted_property=${JSON.stringify(mergedPropertyState)} intent=${params.intent}`,
    );

    if (params.intent === 'MARKET_HEATMAP') {
      const city = this.asOptionalString(mergedPropertyState.city) || 'damascus';
      const heatmap = await this.marketStatsService.getHeatmap(city);
      const districts = heatmap.districts.slice(0, 3);
      this.logger.debug('[buyer-chat] selected_route=heatmap');

      const draft =
        params.language === 'ar'
          ? [
              `أفضل المناطق للاستثمار حالياً في ${heatmap.city}:`,
              ...districts.map(
                (item, index) =>
                  `${index + 1}. ${item.district} — ${
                    item.market_status === 'HOT'
                      ? 'سوق ساخن وطلب مرتفع'
                      : item.market_status === 'UNDERVALUED'
                        ? 'منطقة undervalued وقد ترتفع الأسعار'
                        : 'سوق مستقر'
                  }`,
              ),
            ].join('\n')
          : [
              `Best districts for investment in ${heatmap.city}:`,
              ...districts.map(
                (item, index) =>
                  `${index + 1}. ${item.district} — ${item.market_status}`,
              ),
            ].join('\n');

      return this.buildSimpleReply(
        'MARKET_ANALYSIS',
        await this.composeBuyerReply({
          mode: 'MARKET_ANALYSIS',
          language: params.language,
          userMessage: params.message,
          draft,
          facts: {
            city: heatmap.city,
            districts,
          },
          lockedValues: districts.flatMap((item) => [
            item.district,
            item.avg_price_per_m2,
            item.median_price_per_m2,
            item.market_status,
          ]),
        }),
        {
          city: heatmap.city,
          districts,
        },
        undefined,
        {
          city: heatmap.city,
        },
      );
    }

    const missingFields = this.getMissingAdvisorFields({
      intent: params.intent,
      property: mergedPropertyState,
    });

    if (missingFields.length > 0) {
      return this.buildSimpleReply(
        params.intent === 'INVESTMENT_ANALYSIS'
          ? 'INVESTMENT_ADVICE'
          : 'PRICE_ESTIMATION',
        this.buildAdvisorClarificationReply({
          language: params.language,
          intent: params.intent,
          missingFields,
          hasPropertySignal: this.chatIntentService.hasPropertySignal(params.message),
        }),
        {
          extracted: mergedPropertyState,
          suggested_actions: this.buildStarterSuggestions(params.language),
        },
        undefined,
        mergedPropertyState,
      );
    }

    if (params.intent === 'INVESTMENT_ANALYSIS') {
      this.logger.debug('[buyer-chat] selected_route=investment-analysis');
      const result = await this.advisorService.investmentAnalysis({
        city: String(mergedPropertyState.city || 'damascus'),
        district: String(mergedPropertyState.district),
        property_type: String(mergedPropertyState.property_type),
        area_m2: Number(mergedPropertyState.area_m2),
        ask_price: Number(mergedPropertyState.ask_price),
        bedrooms: this.toPositiveNumber(mergedPropertyState.bedrooms),
      });

      const draft =
        params.language === 'ar'
          ? `العقار ${result.evaluation === 'underpriced' ? 'يبدو فرصة جيدة' : result.evaluation === 'overpriced' ? 'يحتاج حذر في الدخول' : 'يعتبر استثمار جيد'}. السعر قريب من القيمة السوقية المتوقعة ${result.estimated_price} دولار، وحالة السوق في هذه المنطقة ${this.translateMarketStatusAr(
              result.market_status,
            )}. تقييم الاستثمار ${result.investment_score} من 10. ${result.advice}`
          : `This looks like a ${result.evaluation === 'underpriced' ? 'strong' : result.evaluation === 'overpriced' ? 'cautious' : 'balanced'} investment case. The estimated market price is about ${result.estimated_price} USD, the district is ${result.market_status}, and the investment score is ${result.investment_score}/10. ${result.advice}`;

      return this.buildSimpleReply(
        'INVESTMENT_ADVICE',
        await this.composeBuyerReply({
          mode: 'INVESTMENT_ADVICE',
          language: params.language,
          userMessage: params.message,
          draft,
          facts: { ...result },
          lockedValues: [
            result.estimated_price,
            result.difference_percent,
            result.investment_score,
            result.market_status,
            result.confidence,
          ],
        }),
        {
          extracted: mergedPropertyState,
          investment_analysis: result,
        },
        undefined,
        mergedPropertyState,
      );
    }

    this.logger.debug('[buyer-chat] selected_route=evaluate');
    const result = await this.advisorService.evaluateMarketPrice({
      city: String(mergedPropertyState.city || 'damascus'),
      district: String(mergedPropertyState.district),
      property_type: String(mergedPropertyState.property_type),
      area_m2: Number(mergedPropertyState.area_m2),
      ask_price: Number(mergedPropertyState.ask_price),
      bedrooms: this.toPositiveNumber(mergedPropertyState.bedrooms),
    });

    const draft =
      params.language === 'ar'
        ? `بعد تحليل السوق، السعر المتوقع لهذا العقار حوالي ${result.estimated_price} دولار. السعر الحالي ${this.translateEvaluationAr(
            result.evaluation,
          )} لذلك تم تصنيفه كـ ${result.evaluation}. مستوى الثقة في التقييم ${this.translateConfidenceAr(
            result.confidence,
          )}.`
        : `After analyzing the market, the expected price for this property is about ${result.estimated_price} USD. The current asking price is classified as ${result.evaluation}. Confidence is ${result.confidence}.`;

    return this.buildSimpleReply(
      'PRICE_ESTIMATION',
      await this.composeBuyerReply({
        mode: 'PRICE_ESTIMATION',
        language: params.language,
        userMessage: params.message,
        draft,
        facts: { ...result },
        lockedValues: [
          result.estimated_price,
          result.average_price_per_m2,
          result.median_price_per_m2,
          result.comparables_found,
          result.selected_comparables,
          result.difference_percent,
          result.confidence,
        ],
      }),
      {
        extracted: mergedPropertyState,
        market_evaluation: result,
      },
      undefined,
      mergedPropertyState,
    );
  }

  private async findProperties(parsed: {
    city?: string;
    district?: string;
    area_m2?: number;
    budget?: number;
    property_type?: 'APARTMENT' | 'HOUSE' | 'VILLA' | 'STUDIO' | 'LAND';
  }, limit = 5): Promise<RecommendedProperty[]> {
    const conditions: Prisma.Sql[] = [Prisma.sql`1 = 1`];

    if (parsed.city) {
      conditions.push(Prisma.sql`LOWER(city) = LOWER(${parsed.city})`);
    }
    if (parsed.district) {
      conditions.push(
        Prisma.sql`address IS NOT NULL AND LOWER(address) LIKE LOWER(${`%${parsed.district}%`})`,
      );
    }
    if (parsed.property_type) {
      conditions.push(Prisma.sql`type = ${parsed.property_type}`);
    }

    if (Number.isFinite(parsed.area_m2)) {
      const area = Number(parsed.area_m2);
      conditions.push(Prisma.sql`area IS NOT NULL AND area BETWEEN ${area - 20} AND ${area + 20}`);
    }

    if (Number.isFinite(parsed.budget)) {
      const ceiling = Math.round(Number(parsed.budget) * 1.1);
      conditions.push(Prisma.sql`price IS NOT NULL AND price <= ${ceiling}`);
    }

    let predicate = conditions[0];
    for (let i = 1; i < conditions.length; i += 1) {
      predicate = Prisma.sql`${predicate} AND ${conditions[i]}`;
    }

    const orderByBudget = Number.isFinite(parsed.budget)
      ? Prisma.sql`ABS(price - ${Number(parsed.budget)}) ASC, updatedAt DESC`
      : Prisma.sql`updatedAt DESC`;

    const rows = await this.prisma.$queryRaw<RecommendedProperty[]>(Prisma.sql`
      SELECT
        id,
        title,
        city,
        address,
        area,
        price,
        type,
        image,
        createdAt,
        updatedAt
      FROM Property
      WHERE ${predicate}
      ORDER BY ${orderByBudget}
      LIMIT ${limit}
    `);

    return rows;
  }

  private async runSearchFromQuery(params: {
    query: BuyerQueryState;
    sortMode: BuyerSortMode;
    mode: 'find' | 'refine' | 'recommend';
  }): Promise<BuyerDispatchResult> {
    const days = 30;
    const parsedForSearch = {
      city: params.query.city,
      district: params.query.district,
      property_type: params.query.property_type,
      area_m2: params.query.area_m2,
      budget: params.query.budget_syp,
    };

    const results = await this.findProperties(parsedForSearch, 15);
    const ranked = await this.propertyRankingService.rankProperties(
      {
        city: parsedForSearch.city,
        district: parsedForSearch.district,
        property_type: parsedForSearch.property_type,
        area_m2: parsedForSearch.area_m2,
        budget_syp: parsedForSearch.budget,
        days,
      },
      results,
    );
    const sortedRanked = this.applyRankingSort(ranked, params.sortMode);
    const topRanked = sortedRanked.slice(0, 5);
    const marketContext = this.extractMarketContext(topRanked);

    const explainTrace = buildExplainTrace({
      inputs_used: params.query,
      data_sources: {
        market_data: {
          source_table: 'property',
          sample_count: results.length,
        },
        ...(marketContext ? { external_baseline: marketContext } : {}),
      },
      computation_steps: [
        {
          step: 'filter by city and optional district/property_type',
          value: {
            city: params.query.city,
            ...(params.query.district ? { district: params.query.district } : {}),
            property_type: params.query.property_type,
          },
        },
        {
          step: 'apply optional numeric filters (area ±20, price <= budget*1.1)',
          value: {
            ...(params.query.area_m2 != null
              ? { area_filter: { min: params.query.area_m2 - 20, max: params.query.area_m2 + 20 } }
              : {}),
            ...(params.query.budget_syp != null
              ? { price_ceiling: Math.round(params.query.budget_syp * 1.1) }
              : {}),
          },
        },
        {
          step: 'score candidates using deterministic weighted ranking factors',
          value: {
            ranking_weights: this.propertyRankingService.getWeights(),
            days,
          },
        },
        {
          step:
            params.sortMode === 'PRICE_ASC'
              ? 'sort by lowest price first'
              : 'sort by score desc then budget proximity, return top 5',
        },
      ],
      confidence_components: {
        sample_score: results.length >= 5 ? 1 : results.length / 5,
      },
      comparables: topRanked.map((item) => ({
        property_id: item.property.id,
        score: item.score,
        price_match: item.reasons.price_match,
        area_match: item.reasons.area_match,
        market_trend: item.reasons.market_trend,
      })),
    });

    const recommended = topRanked.map((item) => ({
      ...this.serializeProperty(item.property),
      score: item.score,
      reasons: item.reasons,
      why_short: this.buildWhyShort(item),
    }));

    const searchReply = buildBuyerSearchReply({
      mode: params.mode,
      query: params.query,
      ranked_properties: recommended.map((item) => ({
        title: item.title,
        area: item.area,
        price: item.price,
        score: item.score,
      })),
      market_context: marketContext || null,
    });
    const composedText = await this.composeBuyerReply({
      mode: params.mode === 'recommend' ? 'PROPERTY_RECOMMENDATION' : 'PROPERTY_SEARCH',
      language: 'ar',
      userMessage: JSON.stringify(params.query),
      draft: searchReply.text,
      facts: {
        query: params.query,
        count: recommended.length,
        properties: recommended.map((item) => ({
          title: item.title,
          district: item.address,
          price: item.price,
          area_m2: item.area,
          score: item.score,
          why_short: item.why_short,
        })),
        market_context: marketContext || null,
      },
      lockedValues: recommended.flatMap((item) => [
        item.title,
        item.address || '',
        item.price ?? '',
        item.area ?? '',
      ]),
    });

    return {
      intent: params.mode === 'refine' ? 'BUYER_REFINE' : 'FIND_PROPERTIES',
      text: composedText,
      queryState: params.query,
      sortMode: params.sortMode,
      payloadJson: {
        query: params.query,
        mode: params.mode,
        ranking: {
          weights: this.propertyRankingService.getWeights(),
          days,
          sort: params.sortMode,
        },
        sort: params.sortMode,
        ...(marketContext ? { market_context: marketContext } : {}),
        recommended_properties: recommended,
        explain_trace: explainTrace,
        ranking_weights: this.propertyRankingService.getWeights(),
        top_factors: topRanked.slice(0, 3).map((item) => ({
          property_id: item.property.id,
          score: item.score,
          main_reasons: this.summarizeMainReasons(item),
          factors: {
            price_match: item.reasons.price_match,
            area_match: item.reasons.area_match,
            market_trend: item.reasons.market_trend,
          },
        })),
        summary:
          searchReply.summary ??
          (params.mode === 'refine'
            ? `تم تحديث البحث وإيجاد ${recommended.length} عقارات.`
            : params.mode === 'recommend'
              ? `تم ترشيح ${recommended.length} عقارات من قاعدة البيانات حسب أعلى المطابقة.`
            : `تم العثور على ${recommended.length} عقارات.`),
        suggested_actions: [
          ...recommended.map((item) => ({
            type: 'OPEN_PROPERTY',
            label_ar: `فتح ${item.title || `عقار #${item.id}`}`,
            property_id: item.id,
            url: `/properties/${item.id}`,
          })),
          {
            type: 'SAVE_SEARCH',
            label_ar: 'حفظ البحث',
            filtersJson: {
              ...params.query,
            },
          },
        ],
      },
    };
  }

  private applyRefinement(
    message: string,
    lastQuery: Record<string, unknown>,
    lastSort: BuyerSortMode,
  ): { query: BuyerQueryState; sortMode: BuyerSortMode } {
    const normalized = this.normalizeMessage(message);
    const explicit = parseBuyerSearch(message);
    const query: BuyerQueryState = {
      city: this.cleanString(this.asOptionalString(lastQuery.city)) || 'damascus',
      district: this.cleanString(this.asOptionalString(lastQuery.district)),
      property_type:
        this.normalizePropertyType(this.asOptionalString(lastQuery.property_type)) ||
        'APARTMENT',
      area_m2: this.toPositiveNumber(lastQuery.area_m2),
      budget_syp: this.toPositiveNumber(lastQuery.budget_syp),
    };
    let sortMode = lastSort;

    if (/أرخص|ارخص|نزّل|نزل/.test(normalized) && query.budget_syp) {
      query.budget_syp = Math.max(1, Math.round(query.budget_syp * 0.88));
    }
    if (/أغلى|اغلى|زود/.test(normalized) && query.budget_syp) {
      query.budget_syp = Math.round(query.budget_syp * 1.1);
    }
    if (/كبر المساحة|وسع|اكبر/.test(normalized) && query.area_m2) {
      query.area_m2 = Math.round(query.area_m2 + 20);
    }
    if (/صغر المساحة|اصغر|قلل المساحة/.test(normalized) && query.area_m2) {
      query.area_m2 = Math.max(1, Math.round(query.area_m2 - 20));
    }
    if (/بس بالمزة|فقط بالمزة|بالمزة/.test(normalized)) {
      query.district = 'mazzeh';
      query.city = 'damascus';
    }
    if (/بدون\s*فيلا|مو\s*فيلا|ليس\s*فيلا/.test(normalized)) {
      query.property_type = 'APARTMENT';
    }
    if (/رتب حسب الأرخص|رتب حسب الارخص|الأرخص أول|الارخص اول/.test(normalized)) {
      sortMode = 'PRICE_ASC';
    }
    if (/رتب حسب الأعلى سكور|رتب حسب الاعلى سكور|score desc|سكور/.test(normalized)) {
      sortMode = 'SCORE_DESC';
    }

    if (explicit.city) query.city = this.cleanString(explicit.city) || query.city;
    if (explicit.district) query.district = explicit.district;
    if (explicit.property_type) {
      query.property_type = this.normalizePropertyType(explicit.property_type) || query.property_type;
    }
    if (explicit.area_m2 != null && Number.isFinite(explicit.area_m2) && explicit.area_m2 > 0) {
      query.area_m2 = Math.round(explicit.area_m2);
    }
    if (explicit.budget != null && Number.isFinite(explicit.budget) && explicit.budget > 0) {
      query.budget_syp = Math.round(explicit.budget);
    }

    return {
      query: this.buildStableQuery({
        city: query.city,
        district: query.district,
        property_type: query.property_type,
        area_m2: query.area_m2,
        budget: query.budget_syp,
      }),
      sortMode,
    };
  }

  private applyRankingSort<T extends { property: RecommendedProperty; score: number }>(
    ranked: T[],
    sortMode: BuyerSortMode,
  ): T[] {
    if (sortMode !== 'PRICE_ASC') {
      return ranked;
    }
    return [...ranked].sort((a, b) => {
      const aPrice = Number(a.property?.price ?? Number.POSITIVE_INFINITY);
      const bPrice = Number(b.property?.price ?? Number.POSITIVE_INFINITY);
      return aPrice - bPrice;
    });
  }

  private serializeProperty(row: RecommendedProperty) {
    return {
      id: row.id,
      title: row.title,
      city: row.city,
      address: row.address,
      area: row.area,
      price: row.price,
      type: row.type,
      image: row.image,
    };
  }

  private buildStableQuery(parsed: {
    city?: string;
    district?: string;
    property_type?: 'APARTMENT' | 'HOUSE' | 'VILLA' | 'STUDIO' | 'LAND';
    area_m2?: number;
    budget?: number;
  }): BuyerQueryState {
    const city = this.cleanString(parsed.city) || 'damascus';
    const district = this.cleanString(parsed.district);
    const propertyType = this.normalizePropertyType(parsed.property_type) || 'APARTMENT';
    const area = Number(parsed.area_m2);
    const budget = Number(parsed.budget);

    return {
      city,
      ...(district ? { district } : {}),
      property_type: propertyType,
      ...(Number.isFinite(area) && area > 0 ? { area_m2: area } : {}),
      ...(Number.isFinite(budget) && budget > 0 ? { budget_syp: Math.round(budget) } : {}),
    };
  }

  private normalizePropertyType(
    value?: string | null,
  ): 'APARTMENT' | 'HOUSE' | 'VILLA' | 'STUDIO' | 'LAND' | undefined {
    const key = String(value || '').trim().toUpperCase();
    if (key === 'APARTMENT' || key === 'HOUSE' || key === 'VILLA' || key === 'STUDIO' || key === 'LAND') {
      return key;
    }
    if (key === 'APT') return 'APARTMENT';
    return undefined;
  }

  private cleanString(value?: string | null): string | undefined {
    const text = String(value || '').trim();
    return text ? text : undefined;
  }

  private extractMarketContext(
    ranked: Array<{ reasons: { trend_direction: 'UP' | 'DOWN' | 'STABLE'; change_pct: number; trend_volatility: number } }>,
  ): { trend_direction: 'UP' | 'DOWN' | 'STABLE'; change_pct: number; volatility: number } | undefined {
    const first = ranked[0];
    if (!first) return undefined;
    return {
      trend_direction: first.reasons.trend_direction,
      change_pct: first.reasons.change_pct,
      volatility: first.reasons.trend_volatility,
    };
  }

  private summarizeMainReasons(item: {
    reasons: { price_match: number; area_match: number; type_match: number; market_trend: number };
  }): string[] {
    const out: string[] = [];
    if (item.reasons.price_match >= 0.75) out.push('مطابقة قوية للميزانية');
    if (item.reasons.area_match >= 0.75) out.push('مساحة قريبة من المطلوب');
    if (item.reasons.type_match >= 0.99) out.push('نوع العقار مطابق');
    if (item.reasons.market_trend >= 0.85) out.push('اتجاه سوق مناسب للمشتري');
    return out.length ? out : ['مطابقة متوازنة مع متطلباتك'];
  }

  private buildWhyShort(item: {
    reasons: {
      price_match: number;
      area_match: number;
      type_match: number;
      trend_direction: 'UP' | 'DOWN' | 'STABLE';
    };
  }): string {
    const reasons = this.summarizeMainReasons({
      reasons: {
        price_match: item.reasons.price_match,
        area_match: item.reasons.area_match,
        type_match: item.reasons.type_match,
        market_trend:
          item.reasons.trend_direction === 'DOWN'
            ? 0.9
            : item.reasons.trend_direction === 'STABLE'
              ? 0.8
              : 0.6,
      },
    });
    return reasons.slice(0, 2).join('، ');
  }

  private async assertBuyerSession(buyerId: number, sessionId: number) {
    const safeBuyerId = this.validateBuyerId(buyerId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw new BadRequestException('session id must be a positive integer');
    }

    const sessionDelegate = (this.prisma as any).buyerChatSession;
    const session = await sessionDelegate.findUnique({
      where: { id: sessionId },
      select: { id: true, buyerId: true, metaJson: true },
    });

    if (!session) {
      throw new NotFoundException('Buyer chat session not found');
    }

    if (Number(session.buyerId) !== safeBuyerId) {
      throw new ForbiddenException('You cannot access this buyer chat session');
    }

    return session;
  }

  private validateBuyerId(value: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('Invalid buyer id');
    }
    return parsed;
  }

  private validateLimit(value: number, min: number, max: number, fallback: number): number {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException(`limit must be an integer between ${min} and ${max}`);
    }
    return parsed;
  }

  private serializeMessage(row: {
    id: number;
    role: string;
    content: string;
    intent?: string | null;
    payloadJson?: unknown;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      role: row.role,
      content: row.content,
      text: row.content,
      intent: row.intent ?? null,
      payloadJson: row.payloadJson ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toRecord(value: unknown): Record<string, any> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, any>;
  }

  private normalizeSortMode(value: unknown): BuyerSortMode {
    return String(value || '').toUpperCase() === 'PRICE_ASC' ? 'PRICE_ASC' : 'SCORE_DESC';
  }

  private async getLatestAssistantMessage(sessionId: number): Promise<AssistantTurnContext> {
    const messageDelegate = (this.prisma as any).buyerChatMessage;
    const latestAssistant = await messageDelegate.findFirst({
      where: {
        sessionId,
        role: 'ASSISTANT',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        content: true,
        payloadJson: true,
      },
    });

    if (!latestAssistant) {
      return null;
    }

    return {
      content: String(latestAssistant.content || ''),
      payloadJson: this.toRecord(latestAssistant.payloadJson),
    };
  }

  private lastAssistantAskedQuestion(lastAssistant: AssistantTurnContext): boolean {
    if (!lastAssistant?.content) {
      return false;
    }

    if (/[؟?]\s*$/.test(lastAssistant.content.trim())) {
      return true;
    }

    const payload = lastAssistant.payloadJson;
    return Array.isArray(payload?.suggested_actions) && payload.suggested_actions.length > 0;
  }

  private normalizeMessage(value: string): string {
    return String(value || '')
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private toPositiveNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return parsed;
  }

  private asOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private async persistLastQueryState(params: {
    sessionId: number;
    existingMeta: unknown;
    queryState?: BuyerQueryState;
    propertyState?: Record<string, unknown>;
    sortMode?: BuyerSortMode;
  }) {
    const sessionDelegate = (this.prisma as any).buyerChatSession;
    const meta = this.toRecord(params.existingMeta) || {};
    if (params.queryState) {
      meta.last_query = params.queryState;
      meta.last_sort = params.sortMode || 'SCORE_DESC';
    }
    if (params.propertyState && Object.keys(params.propertyState).length > 0) {
      meta.last_property = params.propertyState;
    }
    await sessionDelegate.update({
      where: { id: params.sessionId },
      data: {
        metaJson: meta,
      },
    });
  }

  private async persistRecommendationLog(params: {
    buyerId: number;
    sessionId: number;
    intent: BuyerChatIntent;
    payloadJson: Record<string, unknown>;
  }) {
    if (params.intent !== 'FIND_PROPERTIES' && params.intent !== 'BUYER_REFINE') {
      return;
    }

    try {
      const query = this.toRecord(params.payloadJson?.query) || {};
      const marketContext = this.toRecord(params.payloadJson?.market_context);
      const recommended = Array.isArray(params.payloadJson?.recommended_properties)
        ? params.payloadJson.recommended_properties
        : [];

      const topResults = recommended.slice(0, 5).map((item: any) => ({
        propertyId: Number(item?.id || 0),
        score: Number(item?.score || 0),
        reasons: item?.reasons || {},
        why_short: String(item?.why_short || ''),
      }));

      const delegate = (this.prisma as any).buyerRecommendationLog;
      await delegate.create({
        data: {
          buyerId: Number(params.buyerId),
          sessionId: Number(params.sessionId),
          intent: params.intent,
          queryJson: query,
          resultsJson: topResults,
          marketContextJson: marketContext || null,
        },
      });
    } catch {
      // Recommendation logging must not block chat response.
    }
  }

  private async handleMarketAnalysisIntent(
    message: string,
    lastQuery: Record<string, unknown> | null,
    language: RealEstateLanguage,
  ): Promise<BuyerDispatchResult> {
    const query = this.resolveContextQuery(message, lastQuery);
    if (!query.district) {
      return this.buildSimpleReply(
        'MARKET_ANALYSIS',
        language === 'ar'
          ? 'أستطيع تحليل السوق بدقة أكبر إذا أرسلت اسم المنطقة أولاً، مثل: المزة أو كفرسوسة.'
          : 'I can analyze the market more accurately if you share the district first, for example Mazzeh or Kafar Souseh.',
        { suggested_actions: this.buildStarterSuggestions(language) },
      );
    }

    try {
      const insights = await this.advisorService.getInsights({
        city: query.city,
        district: query.district,
        property_type: query.property_type.toLowerCase(),
        days_window: 90,
      });
      const trend = await this.marketTrendService.getTrend({
        city: query.city,
        district: query.district,
        property_type: query.property_type.toLowerCase(),
        days: 90,
      });

      const trendReply = buildMarketTrendReply({ trend });
      const text =
        language === 'ar'
          ? [
              `تحليل السوق في ${query.district}:`,
              `• متوسط سعر المتر: ${this.formatMoney(Number(insights.stats.avg_ppm2_syp || 0))}.`,
              `• وسيط سعر المتر: ${this.formatMoney(Number(insights.stats.median_ppm2_syp || 0))}.`,
              `• عدد العينات: ${Number(insights.sample_count || 0)}.`,
              `• ${trendReply.text}`,
              'إذا كان هدفك شراء سكن، راقب المناطق الأقل تذبذباً. وإذا كان هدفك استثماراً، راقب المناطق ذات اتجاه صاعد وسيولة أفضل.',
            ].join('\n')
          : [
              `Market analysis for ${query.district}:`,
              `• Average price per m²: ${this.formatMoney(Number(insights.stats.avg_ppm2_syp || 0))}.`,
              `• Median price per m²: ${this.formatMoney(Number(insights.stats.median_ppm2_syp || 0))}.`,
              `• Sample count: ${Number(insights.sample_count || 0)}.`,
              `• ${trendReply.summary || trendReply.text}`,
              'For end use, prioritize stability and services. For investment, watch for strong trend direction, liquidity, and realistic entry prices.',
            ].join('\n');

      return this.buildSimpleReply(
        'MARKET_ANALYSIS',
        await this.composeBuyerReply({
          mode: 'MARKET_ANALYSIS',
          language,
          userMessage: message,
          draft: text,
          facts: {
            district: query.district,
            avg_price_per_m2_syp: Number(insights.stats.avg_ppm2_syp || 0),
            median_price_per_m2_syp: Number(insights.stats.median_ppm2_syp || 0),
            sample_count: Number(insights.sample_count || 0),
            trend,
          },
          lockedValues: [
            query.district || '',
            Number(insights.stats.avg_ppm2_syp || 0),
            Number(insights.stats.median_ppm2_syp || 0),
            Number(insights.sample_count || 0),
            Number(trend.change_pct || 0),
          ],
        }),
        {
          query,
          insights,
          trend,
        },
      );
    } catch {
      return this.buildSimpleReply(
        'MARKET_ANALYSIS',
        language === 'ar'
          ? `حالياً لا توجد بيانات سوق كافية عن ${query.district}، لكن أستطيع إعطاء تحليل أفضل إذا حددت المنطقة ونوع العقار والهدف: سكن أم استثمار.`
          : `I do not have enough structured market data for ${query.district} right now, but I can still guide you better if you share the district, property type, and whether your goal is living or investment.`,
        { query },
      );
    }
  }

  private async handleAreaComparisonIntent(
    message: string,
    language: RealEstateLanguage,
  ): Promise<BuyerDispatchResult> {
    const targets = extractComparisonTargets(message);
    if (targets.length < 2) {
      return this.buildSimpleReply(
        'AREA_COMPARISON',
        language === 'ar'
          ? 'للمقارنة، أرسل منطقتين بشكل واضح مثل: قارن بين المزة وكفرسوسة.'
          : 'For a comparison, send two districts clearly, for example: compare Mazzeh vs Kafar Souseh.',
        {},
      );
    }

    const [left, right] = targets;
    const propertyType = 'apartment';

    const [leftTrend, rightTrend] = await Promise.allSettled([
      this.marketTrendService.getTrend({
        city: 'damascus',
        district: left,
        property_type: propertyType,
        days: 90,
      }),
      this.marketTrendService.getTrend({
        city: 'damascus',
        district: right,
        property_type: propertyType,
        days: 90,
      }),
    ]);

    const leftData = leftTrend.status === 'fulfilled' ? leftTrend.value : null;
    const rightData = rightTrend.status === 'fulfilled' ? rightTrend.value : null;

    const leftTrendText = this.describeTrend(leftData?.trend_direction, language);
    const rightTrendText = this.describeTrend(rightData?.trend_direction, language);
    const text =
      language === 'ar'
        ? [
            `مقارنة بين ${left} و${right}:`,
            `• ${left}: الاتجاه ${leftTrendText}${leftData ? ` (${leftData.change_pct.toFixed(2)}%)` : ''}.`,
            `• ${right}: الاتجاه ${rightTrendText}${rightData ? ` (${rightData.change_pct.toFixed(2)}%)` : ''}.`,
            `• للاستثمار: فضّل المنطقة ذات الاتجاه الأقوى إذا كان سعر الدخول ما زال معقولاً.`,
            `• للسكن العائلي: فضّل المنطقة الأهدأ والأقل تذبذباً والأقرب للخدمات.`,
          ].join('\n')
        : [
            `Comparison between ${left} and ${right}:`,
            `• ${left}: ${leftTrendText}${leftData ? ` (${leftData.change_pct.toFixed(2)}%)` : ''}.`,
            `• ${right}: ${rightTrendText}${rightData ? ` (${rightData.change_pct.toFixed(2)}%)` : ''}.`,
            `• For investment, favor the district with stronger trend if the entry price is still reasonable.`,
            `• For family living, favor the calmer, less volatile district with better daily services.`,
          ].join('\n');

    return this.buildSimpleReply(
      'AREA_COMPARISON',
      await this.composeBuyerReply({
        mode: 'AREA_COMPARISON',
        language,
        userMessage: message,
        draft: text,
        facts: {
          districts: targets,
          comparison: {
            left: leftData,
            right: rightData,
          },
        },
        lockedValues: [left, right, leftData?.change_pct ?? '', rightData?.change_pct ?? ''],
      }),
      {
        districts: targets,
        comparison: {
          left: leftData,
          right: rightData,
        },
      },
    );
  }

  private async handlePriceEstimationIntent(
    message: string,
    lastQuery: Record<string, unknown> | null,
    language: RealEstateLanguage,
  ): Promise<BuyerDispatchResult> {
    const query = this.resolveContextQuery(message, lastQuery);

    if (query.district && query.area_m2 && !query.budget_syp) {
      try {
        const estimate = await this.advisorService.getSellerPriceSuggestion({
          city: query.city,
          district: query.district,
          property_type: query.property_type.toLowerCase(),
          area_m2: query.area_m2,
          user_message: message,
        });

        const text =
          language === 'ar'
            ? `في ${query.district}، ${this.describePropertyTypeAr(query.property_type)} بمساحة ${Math.round(
                query.area_m2,
              )} متر قد يكون سعرها التقريبي ضمن نطاق ${this.formatMoney(
                estimate.optimal_range_syp.min,
              )} إلى ${this.formatMoney(estimate.optimal_range_syp.max)}. السعر الأنسب غالباً قريب من ${this.formatMoney(
                estimate.optimal_price_syp,
              )}، ويتأثر بعمر البناء والتشطيب والطابق والموقف. إذا أردت، أقدر لك السعر بشكل أدق حسب هذه التفاصيل.`
            : `In ${query.district}, a ${this.describePropertyTypeEn(
                query.property_type,
              )} around ${Math.round(
                query.area_m2,
              )} sqm is likely to fall roughly between ${this.formatMoney(
                estimate.optimal_range_syp.min,
              )} and ${this.formatMoney(estimate.optimal_range_syp.max)}. A balanced target is usually near ${this.formatMoney(
                estimate.optimal_price_syp,
              )}, with finish quality, floor, building age, and parking still affecting the final value.`;

        return this.buildSimpleReply(
          'PRICE_ESTIMATION',
          await this.composeBuyerReply({
            mode: 'PRICE_ESTIMATION',
            language,
            userMessage: message,
            draft: text,
            facts: {
              district: query.district,
              property_type: query.property_type,
              area_m2: query.area_m2,
              best_price: estimate.optimal_price_syp,
              best_price_min: estimate.optimal_range_syp.min,
              best_price_max: estimate.optimal_range_syp.max,
              quick_sale_price: estimate.fast_sale_price_syp,
              quick_sale_price_min: estimate.fast_sale_range_syp.min,
              quick_sale_price_max: estimate.fast_sale_range_syp.max,
              confidence: estimate.confidence,
            },
            lockedValues: [
              query.district || '',
              query.area_m2 || '',
              estimate.optimal_price_syp,
              estimate.optimal_range_syp.min,
              estimate.optimal_range_syp.max,
            ],
          }),
          {
            query,
            seller_estimate: estimate,
            explain_trace: estimate.explain_trace ?? null,
          },
        );
      } catch {
        // Fall through to the standard missing-details guidance below.
      }
    }

    if (!query.district || !query.area_m2 || !query.budget_syp) {
      return this.buildSimpleReply(
        'PRICE_ESTIMATION',
        this.buildPriceClarificationReply(query, language),
        { query },
      );
    }

    try {
      const result = await this.advisorService.buyerEvaluate({
        city: query.city,
        district: query.district,
        property_type: query.property_type.toLowerCase(),
        area_m2: query.area_m2,
        ask_price_syp: query.budget_syp,
        user_message: message,
      });
      const reply = buildBuyerEvaluateReply({
        district: query.district,
        area_m2: query.area_m2,
        budget_syp: query.budget_syp,
        result: {
          verdict: result.verdict,
          fair_range_syp: result.fair_range_syp,
          ask_price_syp: result.ask_price_syp,
          confidence: result.confidence,
        },
      });

      return this.buildSimpleReply(
        'PRICE_ESTIMATION',
        await this.composeBuyerReply({
          mode: 'PRICE_ESTIMATION',
          language,
          userMessage: message,
          draft: reply.text,
          facts: {
            district: query.district,
            property_type: query.property_type,
            area_m2: query.area_m2,
            ask_price_syp: result.ask_price_syp,
            fair_min_syp: result.fair_range_syp.min,
            fair_max_syp: result.fair_range_syp.max,
            confidence: result.confidence,
            verdict: result.verdict,
          },
          lockedValues: [
            query.district || '',
            query.area_m2 || '',
            result.ask_price_syp,
            result.fair_range_syp.min,
            result.fair_range_syp.max,
          ],
        }),
        {
          query,
          buyer_evaluate: result,
          explain_trace: result.explain_trace ?? null,
        },
      );
    } catch {
      return this.buildSimpleReply(
        'PRICE_ESTIMATION',
        language === 'ar'
          ? 'بناءً على المتوفر، أحتاج المنطقة والمساحة والسعر المطلوب حتى أقول لك إن كان السعر منطقياً أو أعلى من العادل.'
          : 'To judge whether the price is fair, I still need the district, size, and asking price.',
        { query },
      );
    }
  }

  private async handleGuidanceIntent(
    message: string,
    lastQuery: Record<string, unknown> | null,
    language: RealEstateLanguage,
    intent: RealEstateAssistantIntent,
  ): Promise<BuyerDispatchResult> {
    const query = this.resolveContextQuery(message, lastQuery);

    if (intent === 'FOLLOW_UP_CONTEXTUAL' && lastQuery) {
      const refined = this.applyRefinement(message, lastQuery, 'SCORE_DESC');
      return this.runSearchFromQuery({
        query: refined.query,
        sortMode: refined.sortMode,
        mode: 'refine',
      });
    }

    const text =
      language === 'ar'
        ? this.buildArabicGuidance(intent, query)
        : this.buildEnglishGuidance(intent, query);

    return this.buildSimpleReply(
      intentToBuyerIntent(intent),
      await this.composeBuyerReply({
        mode: this.mapIntentToComposeMode(intent),
        language,
        userMessage: message,
        draft: text,
        facts: {
          intent,
          query,
        },
        lockedValues: [query.city, query.district || '', query.area_m2 || '', query.budget_syp || ''],
      }),
      {
        query,
        suggested_actions: this.buildStarterSuggestions(language),
      },
    );
  }

  private resolveContextQuery(message: string, lastQuery: Record<string, unknown> | null): BuyerQueryState {
    const parsed = parseBuyerSearch(message);
    const base = lastQuery || {};

    return this.buildStableQuery({
      city: parsed.city || this.asOptionalString(base.city) || 'damascus',
      district: parsed.district || this.asOptionalString(base.district),
      property_type:
        parsed.property_type ||
        this.normalizePropertyType(this.asOptionalString(base.property_type)) ||
        'APARTMENT',
      area_m2: parsed.area_m2 ?? this.toPositiveNumber(base.area_m2),
      budget: parsed.budget ?? this.toPositiveNumber(base.budget_syp),
    });
  }

  private buildSimpleReply(
    intent: BuyerChatIntent,
    text: string,
    payloadJson: Record<string, unknown>,
    queryState?: BuyerQueryState,
    propertyState?: Record<string, unknown>,
  ): BuyerDispatchResult {
    return {
      intent,
      text,
      payloadJson,
      queryState,
      propertyState,
    };
  }

  private shouldReusePropertyState(
    message: string,
    lastAssistant: AssistantTurnContext,
  ): boolean {
    const normalized = this.normalizeMessage(message);
    if (!lastAssistant?.content) {
      return false;
    }

    if (
      /(سعره|سعرها|هل هي صفقة|هل هو صفقة|كم سعره|كم سعرها|هي صفقة|صفقة|للشراء|للبيع|للإيجار|مساحته|مساحتها|غرف|غرفة|هذا العقار|هاد العقار|this property|it|that one)/i.test(
        normalized,
      )
    ) {
      return true;
    }

    return false;
  }

  private mergePropertyState(
    current: Record<string, unknown> | null,
    extracted: Record<string, unknown>,
  ): Record<string, unknown> {
    const next: Record<string, unknown> = {
      ...(current || {}),
    };

    for (const [key, value] of Object.entries(extracted)) {
      if (
        value !== undefined &&
        value !== null &&
        !(typeof value === 'string' && value.trim().length === 0)
      ) {
        next[key] = value;
      }
    }

    return next;
  }

  private hasSubstantivePropertyState(value: Record<string, unknown>): boolean {
    return Boolean(
      this.asOptionalString(value.city) ||
        this.asOptionalString(value.district) ||
        this.asOptionalString(value.property_type) ||
        this.toPositiveNumber(value.area_m2) ||
        this.toPositiveNumber(value.ask_price) ||
        this.toPositiveNumber(value.bedrooms),
    );
  }

  private getMissingAdvisorFields(params: {
    intent: ChatAdvisorIntent;
    property: Record<string, unknown>;
  }): string[] {
    const missing: string[] = [];
    const hasLocation =
      Boolean(this.asOptionalString(params.property.district)) ||
      Boolean(this.asOptionalString(params.property.city));

    if (!hasLocation) {
      missing.push('location');
    }
    if (!this.asOptionalString(params.property.property_type)) {
      missing.push('property_type');
    }
    if (!this.toPositiveNumber(params.property.area_m2)) {
      missing.push('area_m2');
    }
    if (
      params.intent === 'INVESTMENT_ANALYSIS' ||
      params.intent === 'PROPERTY_EVALUATION'
    ) {
      if (!this.toPositiveNumber(params.property.ask_price)) {
        missing.push('ask_price');
      }
    }

    return missing;
  }

  private buildAdvisorClarificationReply(params: {
    language: RealEstateLanguage;
    intent: ChatAdvisorIntent;
    missingFields: string[];
    hasPropertySignal: boolean;
  }): string {
    const arabicLabels: Record<string, string> = {
      location: 'المنطقة أو المدينة',
      property_type: 'نوع العقار',
      area_m2: 'المساحة',
      ask_price: 'سعر العرض',
    };

    if (params.language !== 'ar') {
      const labels = params.missingFields.join(', ');
      if (!params.hasPropertySignal) {
        return 'Send the property type, area, district, and asking price. Example: apartment in Mazzeh 120 sqm price 135000.';
      }
      return `I still need: ${labels}.`;
    }

    if (!params.hasPropertySignal) {
      return 'أرسل لي نوع العقار + المنطقة + المساحة + سعر العرض، مثال: شقة بالمزة 120 متر سعرها 135000';
    }

    const labels = params.missingFields.map((field) => arabicLabels[field] || field);
    return `حتى أكمّل التحليل، أحتاج فقط ${labels.join(' و ')}.`;
  }

  private buildStarterSuggestions(language: RealEstateLanguage) {
    return language === 'ar'
      ? [
          { type: 'SUGGEST_QUERY', label_ar: 'بدي شقة بدمشق ضمن ميزانية محددة' },
          { type: 'SUGGEST_QUERY', label_ar: 'قارن بين المزة وكفرسوسة' },
          { type: 'SUGGEST_QUERY', label_ar: 'هل هذا السعر مناسب؟' },
        ]
      : [
          { type: 'SUGGEST_QUERY', label: 'Find me an apartment in Damascus under my budget' },
          { type: 'SUGGEST_QUERY', label: 'Compare Mazzeh and Kafar Souseh' },
          { type: 'SUGGEST_QUERY', label: 'Is this price fair?' },
        ];
  }

  private buildArabicGuidance(intent: RealEstateAssistantIntent, query: BuyerQueryState): string {
    if (intent === 'INVESTMENT_ADVICE') {
      return query.district
        ? `إذا كان هدفك الاستثمار في ${query.district}، ركّز على عائد الإيجار، سهولة إعادة البيع، واستقرار الطلب. الأفضل عادةً هو شراء عقار بسعر دخول معقول في منطقة ذات طلب مستمر، وليس فقط منطقة أسعارها مرتفعة.`
        : 'للاستثمار العقاري، ركّز على ثلاثة عناصر: سعر دخول معقول، طلب إيجاري ثابت، وسيولة جيدة عند إعادة البيع. إذا ذكرت المنطقة والميزانية ونوع العقار أستطيع تضييق الترشيح لك.';
    }
    if (intent === 'RENTAL_GUIDANCE') {
      return 'قرار الإيجار مقابل الشراء يعتمد على مدة سكنك، الدفعة الأولى، واستقرار دخلك. إذا كنت تحتاج مرونة عالية فالإيجار أقوى، أما إذا كان أفقك أطول وسعر الشراء مقبول فقد يكون الشراء أفضل.';
    }
    if (intent === 'BUYER_GUIDANCE') {
      return 'للمشتري الذكي: لا تنظر إلى السعر فقط. قارن بين سعر المتر، جودة الإكساء، الخدمات، سهولة الوصول، وإمكانية إعادة البيع لاحقاً. وإذا أعطيتني المنطقة والميزانية سأرشح لك خيارات عملية.';
    }
    if (intent === 'PROPERTY_DETAILS') {
      return 'إذا أردت رأياً أدق في عقار معيّن، أرسل النوع والمنطقة والمساحة والسعر، وسأوضح لك هل هو مناسب للسكن أو الاستثمار وما نقاط القوة والضعف.';
    }
    return buildUnknownRealEstateReply('ar');
  }

  private buildEnglishGuidance(intent: RealEstateAssistantIntent, query: BuyerQueryState): string {
    if (intent === 'INVESTMENT_ADVICE') {
      return query.district
        ? `For investment in ${query.district}, focus on rental demand, resale liquidity, and whether the entry price is still reasonable. A strong deal is usually one with stable demand and disciplined pricing, not just a famous district.`
        : 'For real-estate investment, focus on entry price, rental demand, and resale liquidity. If you share the district, budget, and property type, I can narrow the strategy for you.';
    }
    if (intent === 'RENTAL_GUIDANCE') {
      return 'Rent-versus-buy depends on how long you plan to stay, your down payment, and monthly affordability. Renting is usually stronger for flexibility, while buying becomes stronger when your time horizon is longer and the purchase price is sensible.';
    }
    if (intent === 'BUYER_GUIDANCE') {
      return 'A smart buyer should compare more than price: look at price per meter, finish quality, services, commute, and resale liquidity. If you share the district and budget, I can turn that into concrete options.';
    }
    if (intent === 'PROPERTY_DETAILS') {
      return 'If you want a sharper opinion on a specific property, send the district, property type, size, and asking price, and I will assess whether it fits living or investment goals.';
    }
    return buildUnknownRealEstateReply('en');
  }

  private describeTrend(
    direction: 'UP' | 'DOWN' | 'STABLE' | undefined,
    language: RealEstateLanguage,
  ): string {
    if (language === 'ar') {
      if (direction === 'UP') return 'صاعد';
      if (direction === 'DOWN') return 'هابط';
      return 'مستقر';
    }
    if (direction === 'UP') return 'uptrend';
    if (direction === 'DOWN') return 'downtrend';
    return 'stable';
  }

  private formatMoney(value: number): string {
    if (!Number.isFinite(value) || value <= 0) {
      return 'غير متاح';
    }
    return `${Math.round(value).toLocaleString('en-US')} ل.س`;
  }

  private buildPriceClarificationReply(
    query: BuyerQueryState,
    language: RealEstateLanguage,
  ): string {
    const missing: string[] = [];
    if (!query.district) missing.push(language === 'ar' ? 'المنطقة' : 'district');
    if (!query.area_m2) missing.push(language === 'ar' ? 'المساحة' : 'size');
    if (!query.budget_syp) missing.push(language === 'ar' ? 'السعر المطلوب' : 'asking price');

    if (language === 'ar') {
      return `حتى أقيّم السعر بشكل أدق، أحتاج ${missing.join(' و ')}. إذا كنت تريد سعراً تقريبياً فقط، يكفي أن ترسل المنطقة والمساحة ونوع العقار.`;
    }

    return `To judge the price more accurately, I still need ${missing.join(', ')}. If you want only an approximate valuation, the district, size, and property type are enough to start.`;
  }

  private describePropertyTypeAr(value: BuyerQueryState['property_type']): string {
    if (value === 'VILLA') return 'فيلا';
    if (value === 'HOUSE') return 'بيت';
    if (value === 'STUDIO') return 'استوديو';
    if (value === 'LAND') return 'أرض';
    return 'شقة';
  }

  private describePropertyTypeEn(value: BuyerQueryState['property_type']): string {
    if (value === 'VILLA') return 'villa';
    if (value === 'HOUSE') return 'house';
    if (value === 'STUDIO') return 'studio';
    if (value === 'LAND') return 'plot of land';
    return 'apartment';
  }

  private isRecommendationLikeMessage(message: string): boolean {
    const normalized = this.normalizeMessage(message);

    return /(recommend|best property|best option|best apartment|best villa|اقتراح|اقترح|رشح|أفضل عقار|أفضل شقة|أنسب عقار|مناسب لعيلة|لعيلة|للاستثمار)/i.test(
      normalized,
    );
  }

  private async composeBuyerReply(params: {
    mode:
      | 'GREETING'
      | 'OUT_OF_SCOPE'
      | 'PROPERTY_SEARCH'
      | 'PROPERTY_RECOMMENDATION'
      | 'PRICE_ESTIMATION'
      | 'MARKET_ANALYSIS'
      | 'AREA_COMPARISON'
      | 'INVESTMENT_ADVICE'
      | 'FOLLOW_UP_CONTEXTUAL'
      | 'REAL_ESTATE_FAQ';
    language: RealEstateLanguage;
    userMessage: string;
    draft: string;
    facts: Record<string, unknown>;
    lockedValues?: Array<string | number>;
  }): Promise<string> {
    return this.aiService.composeRealEstateAnswer({
      mode: params.mode,
      language: params.language,
      userMessage: params.userMessage,
      draft: params.draft,
      facts: params.facts,
      lockedValues: params.lockedValues,
    });
  }

  private mapIntentToComposeMode(
    intent: RealEstateAssistantIntent,
  ):
    | 'PROPERTY_SEARCH'
    | 'PROPERTY_RECOMMENDATION'
    | 'PRICE_ESTIMATION'
    | 'MARKET_ANALYSIS'
    | 'AREA_COMPARISON'
    | 'INVESTMENT_ADVICE'
    | 'FOLLOW_UP_CONTEXTUAL'
    | 'REAL_ESTATE_FAQ' {
    if (intent === 'MARKET_ANALYSIS') return 'MARKET_ANALYSIS';
    if (intent === 'AREA_COMPARISON') return 'AREA_COMPARISON';
    if (intent === 'PRICE_ESTIMATION') return 'PRICE_ESTIMATION';
    if (intent === 'REAL_ESTATE_FAQ') return 'REAL_ESTATE_FAQ';
    if (intent === 'FOLLOW_UP_CONTEXTUAL') return 'FOLLOW_UP_CONTEXTUAL';
    return 'INVESTMENT_ADVICE';
  }

  private translateMarketStatusAr(value: 'HOT' | 'STABLE' | 'UNDERVALUED'): string {
    if (value === 'HOT') return 'سوق ساخن';
    if (value === 'UNDERVALUED') return 'أقل من قيمتها الحالية';
    return 'مستقرة';
  }

  private translateEvaluationAr(
    value: 'underpriced' | 'fair_price' | 'overpriced',
  ): string {
    if (value === 'underpriced') return 'أقل من القيمة السوقية';
    if (value === 'overpriced') return 'أعلى من متوسط السوق';
    return 'قريب جدًا من متوسط السوق';
  }

  private translateConfidenceAr(
    value: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW',
  ): string {
    if (value === 'HIGH') return 'عالي';
    if (value === 'MEDIUM') return 'متوسط';
    if (value === 'LOW') return 'منخفض';
    return 'منخفض جدًا';
  }
}

function intentToBuyerIntent(intent: RealEstateAssistantIntent): BuyerChatIntent {
  if (intent === 'MARKET_ANALYSIS') return 'MARKET_ANALYSIS';
  if (intent === 'AREA_COMPARISON') return 'AREA_COMPARISON';
  if (intent === 'INVESTMENT_ADVICE') return 'INVESTMENT_ADVICE';
  if (intent === 'RENTAL_GUIDANCE') return 'RENTAL_GUIDANCE';
  if (intent === 'BUYER_GUIDANCE') return 'BUYER_GUIDANCE';
  if (intent === 'PRICE_ESTIMATION') return 'PRICE_ESTIMATION';
  if (intent === 'REAL_ESTATE_FAQ') return 'REAL_ESTATE_FAQ';
  if (intent === 'FOLLOW_UP_CONTEXTUAL') return 'FOLLOW_UP_CONTEXTUAL';
  return 'FALLBACK';
}
