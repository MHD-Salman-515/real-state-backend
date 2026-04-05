import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { AiConversationTurn, AiService } from '../ai/ai.service';
import { MarketBrainService } from '../ai/market-brain.service';
import { RagService } from '../ai/rag.service';
import { AdvisorService } from '../advisor/advisor.service';
import { ChatIntentService, type ChatAdvisorIntent, type ExtractedPropertyData } from '../chat/chat-intent.service';
import { OllamaOrchestratorService } from '../chat/ollama-orchestrator.service';
import {
  buildBuyerEvaluateReply,
  buildSellerPriceReply,
} from '../chat-ux/templates';
import {
  buildAcknowledgementReply,
  buildConfirmationReply,
  buildOutOfScopeReply,
  buildRealEstateConceptReply,
  buildRealEstateGreetingReply,
  buildUnknownRealEstateReply,
  classifyRealEstateRequest,
  type RealEstateLanguage,
} from '../chat-ux/real-estate-domain';
import { OwnerAiHistoryService } from '../property/owner-ai-history.service';
import { OwnerPortfolioService } from '../property/owner-portfolio.service';
import { OwnerStrategyService } from '../property/owner-strategy.service';
import { OwnerSuggestionsService } from '../property/owner-suggestions.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketStatsService } from '../market-intelligence/market-stats.service';
import { detectOwnerChatIntent, OwnerChatIntent } from './owner-chat.intent';
import { parseArabicMessage } from './parse-arabic-message';

type OwnedProperty = {
  id: number;
  ownerId: number;
  title: string;
  city: string;
  address: string | null;
  type: string;
  area: number | null;
  price: number | null;
};

type TrackAction =
  | 'accepted_fast'
  | 'accepted_balanced'
  | 'accepted_profit'
  | 'accepted_optimal';

type SuggestedAction = {
  type:
    | 'APPLY_PRICE'
    | 'OPEN_STRATEGY'
    | 'OPEN_SUGGESTIONS'
    | 'OPEN_PORTFOLIO'
    | 'OPEN_HISTORY'
    | 'ASK_FOR_FIELDS';
  label_ar: string;
  property_id?: number;
  price?: number;
  log_id?: string;
  track_action?: TrackAction;
  url?: string;
  note?: string;
};

type ToolMessagePayload = {
  toolName: string;
  text: string;
  payloadJson: Record<string, unknown>;
};

type AssistantResponsePayload = {
  intent: OwnerChatIntent;
  text_ar: string;
  data: Record<string, unknown> | null;
  suggested_actions: SuggestedAction[];
};

type DispatchResult = {
  response: AssistantResponsePayload;
  toolMessages: ToolMessagePayload[];
};

type AssistantTurnContext = {
  text: string;
  payloadJson: Record<string, unknown> | null;
} | null;

type DeterministicContextState = {
  listing_intent?: 'SELL' | 'BUY' | 'RENT' | 'ESTIMATE' | 'INVEST';
  city?: string;
  district?: string;
  property_type?: string;
  area_m2?: number;
  bedrooms?: number;
  ask_price?: number;
  budget_syp?: number;
  pending_slot?: 'ask_price' | 'area_m2' | 'property_type' | 'district' | 'city';
};

@Injectable()
export class OwnerChatService {
  private readonly logger = new Logger(OwnerChatService.name);
  private localAiService: AiService | null = null;
  private aiInitTried = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly advisorService: AdvisorService,
    private readonly marketStatsService: MarketStatsService,
    private readonly chatIntentService: ChatIntentService,
    private readonly ownerStrategyService: OwnerStrategyService,
    private readonly ownerSuggestionsService: OwnerSuggestionsService,
    private readonly ownerPortfolioService: OwnerPortfolioService,
    private readonly ownerAiHistoryService: OwnerAiHistoryService,
    @Optional() private readonly ollamaOrchestrator?: OllamaOrchestratorService,
    @Optional() private readonly aiService?: AiService,
  ) {}

  async createSession(params: { ownerId: number; title?: string }) {
    const sessionDelegate = (this.prisma as any).chatSession;
    const created = await sessionDelegate.create({
      data: {
        ownerId: params.ownerId,
        title: params.title?.trim() || null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      id: created.id,
      title: created.title,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async listSessions(params: { ownerId: number; limit: number }) {
    const sessionDelegate = (this.prisma as any).chatSession;
    const sessions = await sessionDelegate.findMany({
      where: { ownerId: params.ownerId },
      orderBy: { updatedAt: 'desc' },
      take: params.limit,
      select: {
        id: true,
        title: true,
        status: true,
        metaJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      items: sessions.map((session) => ({
        id: session.id,
        title: session.title,
        status: session.status,
        context: this.toRecord(session.metaJson),
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      })),
    };
  }

  async listMessages(params: { ownerId: number; sessionId: number; limit: number }) {
    const session = await this.assertOwnerSession(params.ownerId, params.sessionId);
    const messageDelegate = (this.prisma as any).chatMessage;

    const rows = await messageDelegate.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
      take: params.limit,
      select: {
        id: true,
        role: true,
        text: true,
        intent: true,
        payloadJson: true,
        createdAt: true,
      },
    });

    return {
      sessionId: session.id,
      items: rows.reverse().map((row) => this.serializeMessage(row)),
    };
  }

  async updateSessionContext(params: {
    ownerId: number;
    sessionId: number;
    propertyId: number | null;
  }) {
    const session = await this.assertOwnerSession(params.ownerId, params.sessionId);
    if (params.propertyId != null) {
      await this.getOwnedProperty(params.ownerId, params.propertyId);
    }

    const sessionDelegate = (this.prisma as any).chatSession;
    const currentMeta = this.toRecord(session.metaJson) || {};
    const nextMeta = { ...currentMeta };
    const nextContext = this.toRecord(nextMeta.context) || {};

    if (params.propertyId == null) {
      delete nextContext.propertyId;
    } else {
      nextContext.propertyId = params.propertyId;
    }

    if (Object.keys(nextContext).length > 0) {
      nextMeta.context = nextContext;
    } else {
      delete nextMeta.context;
    }

    const updated = await sessionDelegate.update({
      where: { id: session.id },
      data: {
        metaJson: Object.keys(nextMeta).length > 0 ? nextMeta : null,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        updatedAt: true,
        metaJson: true,
      },
    });

    return {
      sessionId: updated.id,
      synced: true,
      context: this.toRecord(updated.metaJson),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async sendMessage(params: {
    ownerId: number;
    sessionId: number;
    message: string;
    context?: { propertyId?: number };
  }) {
    const session = await this.assertOwnerSession(params.ownerId, params.sessionId);
    const message = String(params.message || '').trim();
    if (!message || message.length < 1 || message.length > 2000) {
      throw new BadRequestException('message must be between 1 and 2000 characters');
    }

    const contextPropertyId =
      params.context?.propertyId ?? this.getSessionPropertyId(session.metaJson ?? null) ?? undefined;
    const lastAssistant = await this.getLatestAssistantMessage(session.id);
    const recentHistory = await this.getRecentConversationHistory(session.id);
    this.logger.log(`OWNER_CHAT_HISTORY loadedTurns=${recentHistory.length}`);
    const parsedArabic = parseArabicMessage(message);
    const extractedProperty = await this.chatIntentService.extractPropertyData(message);
    const contextProperty =
      contextPropertyId != null
        ? await this.getOwnedProperty(params.ownerId, contextPropertyId)
        : null;
    const mergedState = this.mergeDeterministicState({
      metaJson: session.metaJson ?? null,
      parsedArabic,
      extractedProperty,
      contextProperty,
      message,
      lastAssistant,
    });
    this.logger.log(
      `CHAT_ROUTE: ENTRY endpoint=POST /owner/chat/sessions/:id/message service=OwnerChatService.sendMessage extracted=${JSON.stringify(
        extractedProperty,
      )} current_session_last_property=${JSON.stringify(this.pickPropertyState(mergedState))}`,
    );
    await this.persistSessionContextState({
      sessionId: session.id,
      metaJson: session.metaJson ?? null,
      propertyId: contextPropertyId ?? null,
      state: mergedState,
    });

    const messageDelegate = (this.prisma as any).chatMessage;
    const userMsg = await messageDelegate.create({
      data: {
        sessionId: session.id,
        role: 'USER',
        text: message,
        intent: 'USER_INPUT',
        payloadJson: null,
      },
      select: {
        id: true,
        role: true,
        text: true,
        intent: true,
        payloadJson: true,
        createdAt: true,
      },
    });

    const dispatch = await this.dispatch({
      ownerId: params.ownerId,
      message,
      context: contextPropertyId ? { propertyId: contextPropertyId } : undefined,
      deterministicState: mergedState,
      lastAssistant,
      recentHistory,
    });

    const returnedContextState = this.toRecord(dispatch.response.data)?.context_state;
    if (returnedContextState) {
      await this.persistSessionContextState({
        sessionId: session.id,
        metaJson: session.metaJson ?? null,
        propertyId: contextPropertyId ?? null,
        state: returnedContextState as DeterministicContextState,
      });
    }

    const toolRows: any[] = [];
    for (const tool of dispatch.toolMessages) {
      const row = await messageDelegate.create({
        data: {
          sessionId: session.id,
          role: 'TOOL',
          text: tool.text,
          intent: 'TOOL_EXECUTION',
          payloadJson: tool.payloadJson,
        },
        select: {
          id: true,
          role: true,
          text: true,
          intent: true,
          payloadJson: true,
          createdAt: true,
        },
      });
      toolRows.push(row);
    }

    const assistant = await messageDelegate.create({
      data: {
        sessionId: session.id,
        role: 'ASSISTANT',
        text: dispatch.response.text_ar,
        intent: dispatch.response.intent,
        payloadJson: {
          data: dispatch.response.data,
          suggested_actions: dispatch.response.suggested_actions,
          explain_trace: this.extractExplainTrace(dispatch.response.data),
        },
      },
      select: {
        id: true,
        role: true,
        text: true,
        intent: true,
        payloadJson: true,
        createdAt: true,
      },
    });

    await this.persistSessionTaskState({
      sessionId: session.id,
      intent: dispatch.response.intent,
      text: dispatch.response.text_ar,
    });

    await this.updateSessionContext({
      ownerId: params.ownerId,
      sessionId: session.id,
      propertyId: contextPropertyId ?? null,
    });

    const sessionDelegate = (this.prisma as any).chatSession;
    if (!session.title) {
      await sessionDelegate.update({
        where: { id: session.id },
        data: { title: message.slice(0, 80) },
      });
    }

    return {
      sessionId: session.id,
      assistantMessage: assistant.text,
      response: dispatch.response,
      messagesTail: [
        this.serializeMessage(userMsg),
        ...toolRows.map((row) => this.serializeMessage(row)),
        this.serializeMessage(assistant),
      ],
    };
  }

  async applyPriceAction(params: {
    ownerId: number;
    sessionId: number;
    propertyId: number;
    price: number;
    logId?: string;
    trackAction?: TrackAction;
  }) {
    if (!Number.isFinite(params.price) || params.price <= 0) {
      throw new BadRequestException('price must be greater than 0');
    }

    await this.assertOwnerSession(params.ownerId, params.sessionId);
    await this.getOwnedProperty(params.ownerId, params.propertyId);

    const updated = await this.ownerStrategyService.updateOwnerPropertyPrice({
      propertyId: params.propertyId,
      requester: { sub: params.ownerId, role: 'OWNER' },
      price: params.price,
    });

    let tracking =
      params.logId && params.trackAction
        ? { logId: params.logId, action: params.trackAction }
        : await this.resolveTrackingFromSession({
            sessionId: params.sessionId,
            propertyId: params.propertyId,
            price: params.price,
          });

    if (tracking?.logId && tracking?.action) {
      this.advisorService
        .trackOutcome(
          {
            log_id: tracking.logId,
            action: tracking.action,
            final_price_syp: params.price,
          },
          params.ownerId,
        )
        .catch(() => {});
    }

    const messageDelegate = (this.prisma as any).chatMessage;
    const toolMessage = await messageDelegate.create({
      data: {
        sessionId: params.sessionId,
        role: 'TOOL',
        text: 'تم تطبيق السعر بنجاح',
        intent: 'APPLY_PRICE_ACTION',
        payloadJson: {
          action: 'APPLY_PRICE',
          propertyId: params.propertyId,
          price: params.price,
          track_action: tracking?.action ?? null,
          log_id: tracking?.logId ?? null,
        },
      },
      select: {
        id: true,
        role: true,
        text: true,
        intent: true,
        payloadJson: true,
        createdAt: true,
      },
    });

    return {
      sessionId: params.sessionId,
      property: {
        id: updated.id,
        price: Number(updated.price),
      },
      confirmation_text: 'تم تطبيق السعر بنجاح',
      toolMessage: this.serializeMessage(toolMessage),
    };
  }

  async archiveSession(params: { ownerId: number; sessionId: number }) {
    const session = await this.assertOwnerSession(params.ownerId, params.sessionId);
    const sessionDelegate = (this.prisma as any).chatSession;
    const updated = await sessionDelegate.update({
      where: { id: session.id },
      data: { status: 'ARCHIVED' },
      select: { id: true, status: true, updatedAt: true },
    });
    return {
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteSession(params: { ownerId: number; sessionId: number }) {
    const session = await this.assertOwnerSession(params.ownerId, params.sessionId);
    const sessionDelegate = (this.prisma as any).chatSession;
    await sessionDelegate.delete({ where: { id: session.id } });
    return { success: true };
  }

  private async dispatch(params: {
    ownerId: number;
    message: string;
    context?: { propertyId?: number };
    deterministicState?: DeterministicContextState;
    lastAssistant?: AssistantTurnContext;
    recentHistory?: AiConversationTurn[];
  }): Promise<DispatchResult> {
    const intent = detectOwnerChatIntent({
      message: params.message,
      contextPropertyId: params.context?.propertyId,
    });

    if (intent === 'PROPERTY_STRATEGY') {
      return this.handlePropertyStrategy({
        ownerId: params.ownerId,
        propertyId: params.context?.propertyId as number,
        message: params.message,
      });
    }
    if (intent === 'SUGGESTIONS_QUEUE') {
      return this.handleSuggestions(params.ownerId, params.message);
    }
    if (intent === 'PORTFOLIO') {
      return this.handlePortfolio(params.ownerId, params.message);
    }
    if (intent === 'MARKET_WATCH_INSIGHTS') {
      return this.handleMarketInsights({
        ownerId: params.ownerId,
        message: params.message,
        propertyId: params.context?.propertyId,
      });
    }
    if (intent === 'AI_HISTORY') {
      return this.handleHistory(params.ownerId, params.message);
    }

    return this.handleAiFallback(params);
  }

  private async handleAiFallback(params: {
    ownerId: number;
    message: string;
    context?: { propertyId?: number };
    deterministicState?: DeterministicContextState;
    lastAssistant?: AssistantTurnContext;
    recentHistory?: AiConversationTurn[];
  }): Promise<DispatchResult> {
    try {
      const explicit = this.extractGeoInputs(params.message);
      const parsedArabic = parseArabicMessage(params.message);
      const explicitProperty = await this.chatIntentService.extractPropertyData(params.message);
      const advisorIntent = this.chatIntentService.detectIntent(params.message);
      const isSellerQuery = this.isSellerQuery(params.message);
      let contextProperty: OwnedProperty | null = null;
      if (params.context?.propertyId) {
        contextProperty = await this.getOwnedProperty(
          params.ownerId,
          params.context.propertyId,
        );
      }

      const state = params.deterministicState ?? {};
      const city =
        explicitProperty.city ||
        explicit.city ||
        parsedArabic.city ||
        state.city ||
        (contextProperty?.city ? String(contextProperty.city) : undefined) ||
        'damascus';
      const district =
        explicitProperty.district ||
        explicit.district ||
        parsedArabic.district ||
        state.district ||
        (contextProperty?.address ? String(contextProperty.address) : undefined);
      const propertyType =
        explicitProperty.property_type ||
        explicit.property_type ||
        parsedArabic.property_type ||
        state.property_type ||
        this.mapPropertyType(contextProperty?.type) ||
        'apartment';
      const areaM2 =
        this.toPositiveNumber(explicitProperty.area_m2) ??
        this.toPositiveNumber(parsedArabic.area_m2) ??
        this.toPositiveNumber(state.area_m2) ??
        this.toPositiveNumber(contextProperty?.area);
      const bedrooms =
        this.toPositiveNumber(explicitProperty.bedrooms) ??
        this.toPositiveNumber(state.bedrooms);
      const askPrice =
        this.toPositiveNumber(explicitProperty.ask_price) ??
        this.toPositiveNumber(state.ask_price);
      const budgetSyp =
        askPrice ??
        this.toPositiveNumber(parsedArabic.budget_syp) ??
        this.toPositiveNumber(state.budget_syp);
      const listingIntent = parsedArabic.listing_intent ?? state.listing_intent;
      const sellerFlowActive =
        listingIntent === 'SELL' || listingIntent === 'ESTIMATE' || isSellerQuery;
      const domain = classifyRealEstateRequest({
        message: params.message,
        hasRealEstateContext: Boolean(
          params.context?.propertyId ||
            params.lastAssistant?.text ||
            state.listing_intent ||
            state.city ||
            state.district ||
            state.property_type ||
            state.area_m2 ||
            state.ask_price ||
            state.budget_syp,
        ),
        contextHints: [
          city || '',
          district || '',
          propertyType || '',
          contextProperty?.title || '',
          params.lastAssistant?.text || '',
        ].filter(Boolean),
      });
      const inRealEstateFlow = domain.domain === 'IN_SCOPE_REAL_ESTATE';
      const currentPropertyState = this.pickPropertyState({
        city,
        district,
        property_type: propertyType,
        area_m2: areaM2,
        bedrooms,
        ask_price: askPrice,
      });

      this.logger.log(
        `CHAT_ROUTE: INPUT detected_intent=${advisorIntent} domain=${domain.domain} extracted_property=${JSON.stringify(
          explicitProperty,
        )} current_session_last_property=${JSON.stringify(currentPropertyState)} final_selected_handler=pending`,
      );
      this.logger.log(`OWNER_CHAT_ROUTE intent=${advisorIntent} domain=${domain.domain}`);

      if (this.ollamaOrchestrator) {
        const lastDeterministicResult = Boolean(
          params.lastAssistant?.payloadJson?.data &&
            (this.toRecord(params.lastAssistant.payloadJson.data)?.market_evaluation ||
              this.toRecord(params.lastAssistant.payloadJson.data)?.investment_analysis ||
              this.toRecord(params.lastAssistant.payloadJson.data)?.market_heatmap),
        );
        const orchestrated = await this.ollamaOrchestrator.orchestrateOwnerChat({
          message: params.message,
          state,
          lastAssistantText: params.lastAssistant?.text || null,
          recentHistory: params.recentHistory || [],
          lastDeterministicResult,
        });

        if (orchestrated.handled) {
          this.logger.log(
            `CHAT_ROUTE: FINAL handler=ollama_orchestrator:${orchestrated.route}`,
          );
          this.logger.log(`FINAL_RESPONSE_SOURCE source=${orchestrated.responseSource}`);
          return this.buildScopedReply({
            intent: orchestrated.responseIntent,
            text: orchestrated.text,
            data: orchestrated.data,
          });
        }
      }

      const investmentPriority = this.isInvestmentPriorityMessage(params.message);
      if (investmentPriority) {
        this.logger.log(
          'CHAT_ROUTE: BLOCKED_LEGACY_ROUTE reason=investment_priority blocked=legacy_refine,legacy_search,legacy_seller_price',
        );
        const forcedInvestmentRoute = await this.handleMarketIntelligenceRoute({
          ownerId: params.ownerId,
          message: params.message,
          advisorIntent: 'INVESTMENT_ANALYSIS',
          language: domain.language,
          state,
          explicitProperty,
          currentPropertyState,
          lastAssistant: params.lastAssistant ?? null,
        });
        if (forcedInvestmentRoute) {
          this.logger.log('CHAT_ROUTE: FINAL handler=market_intelligence_hard_stop');
          return forcedInvestmentRoute;
        }
      }

      if (domain.domain === 'OUT_OF_SCOPE') {
        this.logger.log('CHAT_ROUTE: FINAL handler=out_of_scope');
        this.logger.log('FINAL_RESPONSE_SOURCE source=formatter');
        return this.buildScopedReply({
          intent: 'FALLBACK',
          text: await this.composeOwnerReply({
            mode: 'OUT_OF_SCOPE',
            language: domain.language,
            userMessage: params.message,
            draft: buildOutOfScopeReply(domain.language),
            facts: {
              redirect_topics:
                domain.language === 'ar'
                  ? ['شراء العقارات', 'بيع العقارات', 'التسعير', 'تحليل السوق']
                  : ['buying', 'selling', 'pricing', 'market analysis'],
            },
          }),
          data: null,
        });
      }

      const highPriorityRoute = await this.handleMarketIntelligenceRoute({
        ownerId: params.ownerId,
        message: params.message,
        advisorIntent,
        language: domain.language,
        state,
        explicitProperty,
        currentPropertyState,
        lastAssistant: params.lastAssistant ?? null,
      });
      if (highPriorityRoute) {
        this.logger.log('CHAT_ROUTE: FINAL handler=market_intelligence_hard_stop');
        return highPriorityRoute;
      }

      if (
        advisorIntent === 'GENERAL_QUESTION' &&
        this.isPartialPropertyStateUpdate({
          message: params.message,
          state,
          explicitProperty,
          currentPropertyState,
        })
      ) {
        const partialReplyState = this.sanitizePartialPropertyStateForReply({
          explicitProperty,
          currentPropertyState,
        });
        this.logger.log(
          `CHAT_ROUTE: PARTIAL_PROPERTY_STATE_UPDATE stored=${JSON.stringify(
            partialReplyState,
          )} final_selected_handler=partial_property_state_update`,
        );
        this.logger.log(
          'CHAT_ROUTE: BLOCKED_LEGACY_ROUTE reason=partial_property_state_update blocked=legacy_refine,legacy_search,legacy_seller_price',
        );
        return this.buildScopedReply({
          intent: 'FALLBACK',
          text: this.buildPartialPropertyStateReply(partialReplyState),
          data: {
            context_state: state,
            current_session_last_property: partialReplyState,
          },
        });
      }

      if (
        (domain.intent === 'GREETING_REAL_ESTATE' || domain.intent === 'SMALL_TALK_ALLOWED') &&
        !sellerFlowActive &&
        !budgetSyp
      ) {
        this.logger.log('CHAT_ROUTE: FINAL handler=greeting_small_talk');
        this.logger.log('FINAL_RESPONSE_SOURCE source=formatter');
        return this.buildScopedReply({
          intent: 'SMALL_TALK',
          text: await this.composeOwnerReply({
            mode: 'GREETING',
            language: domain.language,
            userMessage: params.message,
            draft: buildRealEstateGreetingReply(domain.language),
            facts: {
              allowed_topics:
                domain.language === 'ar'
                  ? ['بيع', 'تسعير', 'تحليل سوق', 'استراتيجية']
                  : ['selling', 'pricing', 'market analysis', 'strategy'],
            },
          }),
          data: {
            context_state: state,
          },
        });
      }

      if (domain.intent === 'ACKNOWLEDGEMENT') {
        this.logger.log('CHAT_ROUTE: FINAL handler=acknowledgement');
        this.logger.log('FINAL_RESPONSE_SOURCE source=formatter');
        return this.buildScopedReply({
          intent: 'SMALL_TALK',
          text: buildAcknowledgementReply(domain.language),
          data: {
            context_state: state,
            conversational_intent: domain.intent,
          },
        });
      }

      if (domain.intent === 'CONFIRMATION_YES' || domain.intent === 'CONFIRMATION_NO') {
        this.logger.log('CHAT_ROUTE: FINAL handler=confirmation');
        this.logger.log('FINAL_RESPONSE_SOURCE source=formatter');
        return this.buildScopedReply({
          intent: 'FALLBACK',
          text: buildConfirmationReply({
            language: domain.language,
            confirmed: domain.intent === 'CONFIRMATION_YES',
            hasActionableContext: this.lastAssistantAskedQuestion(params.lastAssistant || null),
          }),
          data: {
            context_state: state,
            conversational_intent: domain.intent,
            follow_up_to: params.lastAssistant?.text || null,
          },
        });
      }

      if (domain.needsClarification && domain.clarificationQuestion) {
        this.logger.log('CHAT_ROUTE: FINAL handler=domain_clarification');
        this.logger.log('FINAL_RESPONSE_SOURCE source=formatter');
        return this.buildScopedReply({
          intent: 'FALLBACK',
          text: domain.clarificationQuestion,
          data: {
            context_state: state,
            needs_clarification: true,
            recovered_intent: domain.intent,
          },
        });
      }

      if (domain.intent === 'REAL_ESTATE_FAQ') {
        this.logger.log('CHAT_ROUTE: FINAL handler=real_estate_faq');
        this.logger.log('FINAL_RESPONSE_SOURCE source=formatter');
        return this.buildScopedReply({
          intent: 'FALLBACK',
          text: await this.composeOwnerReply({
            mode: 'REAL_ESTATE_FAQ',
            language: domain.language,
            userMessage: params.message,
            draft: buildRealEstateConceptReply(params.message, domain.language),
            facts: {
              topic: params.message,
            },
          }),
          data: {
            context_state: state,
          },
        });
      }

      // Deterministic state machine first, but only for real-estate flow.
      if (inRealEstateFlow && (sellerFlowActive || budgetSyp != null) && !district) {
        this.logger.log('CHAT_ROUTE: LEGACY_REFINE missing=district handler=legacy_refine final_selected_handler=legacy_refine');
        return {
          response: {
            intent: 'FALLBACK',
            text_ar:
              'أحتاج المنطقة فقط حتى أكمل معك التقييم بشكل أدق.\nمثال: الشعلان أو كفرسوسة أو المزة.',
            data: {
              required: 'district',
              context_state: state,
            },
            suggested_actions: [
              {
                type: 'ASK_FOR_FIELDS',
                label_ar: 'أرسل المنطقة',
                note: 'مثال: المزة',
              },
            ],
          },
          toolMessages: [],
        };
      }
      if (inRealEstateFlow && (sellerFlowActive || budgetSyp != null) && !areaM2) {
        this.logger.log('CHAT_ROUTE: LEGACY_REFINE missing=area_m2 handler=legacy_refine final_selected_handler=legacy_refine');
        return {
          response: {
            intent: 'FALLBACK',
            text_ar:
              'ممتاز. بقيت المساحة فقط بالمتر حتى أعطيك تقديراً أدق.\nمثال: 150 متر.',
            data: {
              required: 'area_m2',
              context_state: state,
            },
            suggested_actions: [
              {
                type: 'ASK_FOR_FIELDS',
                label_ar: 'أرسل المساحة',
                note: 'مثال: 150 متر',
              },
            ],
          },
          toolMessages: [],
        };
      }

      if (inRealEstateFlow && budgetSyp != null && district && areaM2) {
        this.logger.log('CHAT_ROUTE: LEGACY_SEARCH handler=advisor_buyer_evaluate final_selected_handler=advisor_buyer_evaluate');
        const buyer = await this.advisorService.buyerEvaluate({
          city,
          district,
          property_type: propertyType as any,
          area_m2: areaM2,
          ask_price_syp: budgetSyp,
          user_message: params.message,
        });
        const buyerReply = buildBuyerEvaluateReply({
          district,
          area_m2: areaM2,
          budget_syp: budgetSyp,
          result: {
            verdict: buyer.verdict,
            fair_range_syp: buyer.fair_range_syp,
            ask_price_syp: buyer.ask_price_syp,
            confidence: buyer.confidence,
          },
        });

        return {
          response: {
            intent: 'BUYER_EVALUATE',
            text_ar: await this.composeOwnerReply({
              mode: 'PRICE_ESTIMATION',
              language: domain.language,
              userMessage: params.message,
              draft: buyerReply.text,
              facts: {
                district,
                property_type: propertyType,
                area_m2: areaM2,
                ask_price_syp: buyer.ask_price_syp,
                fair_min_syp: buyer.fair_range_syp.min,
                fair_max_syp: buyer.fair_range_syp.max,
                confidence: buyer.confidence,
                verdict: buyer.verdict,
              },
              lockedValues: [
                district || '',
                areaM2 || '',
                buyer.ask_price_syp,
                buyer.fair_range_syp.min,
                buyer.fair_range_syp.max,
              ],
            }),
            data: {
              buyer_evaluate: buyer,
              explain_trace: buyer.explain_trace ?? null,
              summary: buyerReply.summary ?? null,
            },
            suggested_actions: [],
          },
          toolMessages: [
            {
              toolName: 'advisor_buyer_evaluate',
              text: 'TOOL advisor_buyer_evaluate executed',
              payloadJson: {
                input: {
                  city,
                  district,
                  property_type: propertyType,
                  area_m2: areaM2,
                  ask_price_syp: budgetSyp,
                },
                verdict: buyer.verdict,
              },
            },
          ],
        };
      }

      if (inRealEstateFlow && sellerFlowActive && district && areaM2) {
        this.logger.log('CHAT_ROUTE: LEGACY_SELLER_PRICE handler=advisor_seller_price final_selected_handler=advisor_seller_price');
        const seller = await this.advisorService.getSellerPriceSuggestion({
          city,
          district,
          property_type: propertyType as any,
          area_m2: areaM2,
          user_message: params.message,
        });
        const sellerReply = buildSellerPriceReply({
          district,
          area_m2: areaM2,
          result: {
            optimal_price_syp: seller.optimal_price_syp,
            optimal_range_syp: seller.optimal_range_syp,
            fast_sale_price_syp: seller.fast_sale_price_syp,
            fast_sale_range_syp: seller.fast_sale_range_syp,
            confidence: seller.confidence,
          },
        });

        return {
          response: {
            intent: 'SELLER_PRICE',
            text_ar: await this.composeOwnerReply({
              mode: 'SELLER_GUIDANCE',
              language: domain.language,
              userMessage: params.message,
              draft: sellerReply.text,
              facts: {
                district,
                property_type: propertyType,
                area_m2: areaM2,
                best_price: seller.optimal_price_syp,
                best_price_min: seller.optimal_range_syp.min,
                best_price_max: seller.optimal_range_syp.max,
                quick_sale_price: seller.fast_sale_price_syp,
                quick_sale_price_min: seller.fast_sale_range_syp.min,
                quick_sale_price_max: seller.fast_sale_range_syp.max,
                confidence: seller.confidence,
              },
              lockedValues: [
                district || '',
                areaM2 || '',
                seller.optimal_price_syp,
                seller.optimal_range_syp.min,
                seller.optimal_range_syp.max,
              ],
            }),
            data: {
              seller_price: seller,
              explain_trace: seller.explain_trace ?? null,
              summary: sellerReply.summary ?? null,
            },
            suggested_actions: [],
          },
          toolMessages: [
            {
              toolName: 'advisor_seller_price',
              text: 'TOOL advisor_seller_price executed',
              payloadJson: {
                input: {
                  city,
                  district,
                  property_type: propertyType,
                  area_m2: areaM2,
                },
                optimal_price_syp: seller.optimal_price_syp,
                fast_sale_price_syp: seller.fast_sale_price_syp,
              },
            },
          ],
        };
      }

      const aiService = this.getAiService();
      if (!aiService) {
        this.logger.log('CHAT_ROUTE: FINAL handler=static_ai_failure_no_ai_service');
        this.logger.log('FINAL_RESPONSE_SOURCE source=emergency_fallback');
        return this.handleStaticAiFailure(domain.language);
      }

      const ai = await aiService.generateOwnerAdvisorReply({
        message: params.message,
        ownerId: params.ownerId,
        propertyId: params.context?.propertyId,
        district: district || undefined,
      });

      const aiMessage = String(ai?.message || '').trim();
      const safeMessage =
        aiMessage || 'حالياً لا أستطيع تحليل السوق، حاول مرة أخرى.';

      if (ai?.action === 'APPLY_PRICE') {
        const propertyId = Number(params.context?.propertyId || 0);
        const suggestedPrice = Number((ai?.payload as any)?.suggested_price);
        if (
          Number.isInteger(propertyId) &&
          propertyId > 0 &&
          Number.isFinite(suggestedPrice) &&
          suggestedPrice > 0
        ) {
          this.logger.log('CHAT_ROUTE: FINAL handler=ai_apply_price');
          const updated = await this.ownerStrategyService.updateOwnerPropertyPrice({
            propertyId,
            requester: { sub: params.ownerId, role: 'OWNER' },
            price: suggestedPrice,
          });

          return {
            response: {
              intent: 'FALLBACK',
              text_ar: `${safeMessage}\n- تم تطبيق السعر المقترح: ${this.formatSyp(
                suggestedPrice,
              )} ل.س`,
              data: {
                ai_payload: ai.payload ?? null,
                ...(this.toRecord(ai?.payload)?.explain_trace
                  ? { explain_trace: this.toRecord(ai?.payload)?.explain_trace }
                  : {}),
                applied_price: Number(updated.price),
                property_id: updated.id,
              },
              suggested_actions: [
                {
                  type: 'OPEN_STRATEGY',
                  label_ar: 'افتح مركز الاستراتيجية',
                  property_id: updated.id,
                  url: `/owner/properties/${updated.id}/strategy`,
                },
              ],
            },
            toolMessages: [
              {
                toolName: 'ai_apply_price',
                text: 'TOOL ai_apply_price executed',
                payloadJson: {
                  action: 'APPLY_PRICE',
                  property_id: updated.id,
                  price: Number(updated.price),
                },
              },
            ],
          };
        }
      }

      if (ai?.action === 'OPEN_STRATEGY') {
        this.logger.log('CHAT_ROUTE: FINAL handler=ai_open_strategy');
        const propertyId = Number(params.context?.propertyId || 0);
        return {
          response: {
            intent: 'FALLBACK',
            text_ar: safeMessage,
            data: {
              ai_payload: ai.payload ?? null,
              ...(this.toRecord(ai?.payload)?.explain_trace
                ? { explain_trace: this.toRecord(ai?.payload)?.explain_trace }
                : {}),
            },
            suggested_actions: [
              {
                type: 'OPEN_STRATEGY',
                label_ar: 'افتح مركز الاستراتيجية',
                ...(propertyId > 0
                  ? {
                      property_id: propertyId,
                      url: `/owner/properties/${propertyId}/strategy`,
                    }
                  : { url: '/owner/properties' }),
              },
            ],
          },
          toolMessages: [],
        };
      }

      if (ai?.action === 'OPEN_SUGGESTIONS') {
        this.logger.log('CHAT_ROUTE: FINAL handler=ai_open_suggestions');
        return {
          response: {
            intent: 'FALLBACK',
            text_ar: safeMessage,
            data: {
              ai_payload: ai.payload ?? null,
              ...(this.toRecord(ai?.payload)?.explain_trace
                ? { explain_trace: this.toRecord(ai?.payload)?.explain_trace }
                : {}),
            },
            suggested_actions: [
              {
                type: 'OPEN_SUGGESTIONS',
                label_ar: 'افتح صفحة المهام الذكية',
                url: '/owner/suggestions',
              },
            ],
          },
          toolMessages: [],
        };
      }

      this.logger.log('CHAT_ROUTE: FINAL handler=ai_fallback');
      this.logger.log('FINAL_RESPONSE_SOURCE source=ollama');
      return {
        response: {
          intent: 'FALLBACK',
          text_ar: safeMessage,
          data: {
            ai_payload: ai.payload ?? null,
            ...(this.toRecord(ai?.payload)?.explain_trace
              ? { explain_trace: this.toRecord(ai?.payload)?.explain_trace }
              : {}),
          },
          suggested_actions: [],
        },
        toolMessages: [],
      };
    } catch {
      this.logger.log('CHAT_ROUTE: FINAL handler=static_ai_failure_exception');
      this.logger.log('FINAL_RESPONSE_SOURCE source=emergency_fallback');
      return this.handleStaticAiFailure('ar');
    }
  }

  private async handleMarketIntelligenceRoute(params: {
    ownerId: number;
    message: string;
    advisorIntent: ChatAdvisorIntent;
    language: RealEstateLanguage;
    state: DeterministicContextState;
    explicitProperty: ExtractedPropertyData;
    currentPropertyState: ExtractedPropertyData;
    lastAssistant: AssistantTurnContext;
  }): Promise<DispatchResult | null> {
    if (
      params.advisorIntent !== 'PROPERTY_EVALUATION' &&
      params.advisorIntent !== 'INVESTMENT_ANALYSIS' &&
      params.advisorIntent !== 'MARKET_HEATMAP'
    ) {
      return null;
    }

    const clearContinuation = this.isClearPropertyContinuation({
      message: params.message,
      lastAssistant: params.lastAssistant,
    });
    const hasExplicitPropertyFacts = Boolean(
      params.explicitProperty.city ||
        params.explicitProperty.district ||
        params.explicitProperty.property_type ||
        params.explicitProperty.area_m2 ||
        params.explicitProperty.ask_price ||
        params.explicitProperty.bedrooms,
    );
    const effectiveProperty = clearContinuation
      ? this.pickPropertyState({
          ...this.pickPropertyState(params.state),
          ...params.currentPropertyState,
        })
      : this.pickPropertyState(params.currentPropertyState);
    const usesFreshState = clearContinuation || hasExplicitPropertyFacts;
    const propertySource = clearContinuation
      ? 'state_plus_explicit_continuation'
      : hasExplicitPropertyFacts
        ? 'explicit_only_no_stale_merge'
        : 'none';

    this.logger.log(
      `CHAT_ROUTE: CANDIDATE intent=${params.advisorIntent} usesFreshState=${usesFreshState} property_source=${propertySource} extracted_property=${JSON.stringify(
        params.explicitProperty,
      )} current_session_last_property=${JSON.stringify(
        this.pickPropertyState(params.state),
      )} effective_property=${JSON.stringify(
        effectiveProperty,
      )}`,
    );

    if (params.advisorIntent === 'MARKET_HEATMAP') {
      const city = effectiveProperty.city;
      if (!city) {
        this.logger.log(
          'CHAT_ROUTE: BLOCKED_LEGACY_ROUTE reason=market_summary_priority blocked=legacy_refine,legacy_search,legacy_seller_price',
        );
        this.logger.log(
          'CHAT_ROUTE: NEW_MARKET_SUMMARY handler=missing_city_clarification final_selected_handler=missing_city_clarification',
        );
        return this.buildScopedReply({
          intent: 'FALLBACK',
          text: 'عن أي مدينة تريد ملخص السوق؟ مثال: دمشق',
          data: {
            required_fields: ['city'],
            context_state: params.state,
          },
        });
      }

      this.logger.log(
        'CHAT_ROUTE: BLOCKED_LEGACY_ROUTE reason=market_summary_priority blocked=legacy_refine,legacy_search,legacy_seller_price',
      );
      const heatmap = await this.marketStatsService.getHeatmap(city);
      const summary = this.buildHeatmapReply({
        city: heatmap.city,
        message: params.message,
        districts: heatmap.districts,
      });
      this.logger.log(
        'CHAT_ROUTE: NEW_MARKET_SUMMARY handler=marketStatsService.getHeatmap final_selected_handler=marketStatsService.getHeatmap',
      );
      this.logger.log('CHAT_ROUTE: NEW_MARKET_HEATMAP handler=marketStatsService.getHeatmap final_selected_handler=marketStatsService.getHeatmap');
      return this.buildScopedReply({
        intent: 'FALLBACK',
        text: summary,
        data: {
          market_heatmap: {
            city: heatmap.city,
            districts: heatmap.districts.slice(0, 3),
          },
          context_state: params.state,
        },
      });
    }

    if (!usesFreshState) {
      this.logger.log(
        `CHAT_ROUTE: NEW_${params.advisorIntent} handler=missing_fields_no_stale_state final_selected_handler=missing_fields_no_stale_state`,
      );
      return this.buildScopedReply({
        intent: 'FALLBACK',
        text:
          'أرسل لي نوع العقار + المنطقة + المساحة + سعر العرض، مثال: شقة بالمزة 120 متر سعرها 135000',
        data: {
          required_fields: ['property_type', 'district_or_city', 'area_m2', 'ask_price'],
          context_state: params.state,
        },
      });
    }

    const city = effectiveProperty.city;
    const district = effectiveProperty.district;
    const propertyType = effectiveProperty.property_type;
    const areaM2 = this.toPositiveNumber(effectiveProperty.area_m2);
    const askPrice = this.toPositiveNumber(effectiveProperty.ask_price);
    const bedrooms = this.toPositiveNumber(effectiveProperty.bedrooms);

    const missingFields: string[] = [];
    if (!district && !city) missingFields.push('district_or_city');
    if (params.advisorIntent === 'INVESTMENT_ANALYSIS' && !district) {
      missingFields.push('district');
    }
    if (!propertyType) missingFields.push('property_type');
    if (!areaM2) missingFields.push('area_m2');
    if (!askPrice) missingFields.push('ask_price');

    if (missingFields.length > 0) {
      this.logger.log(
        `CHAT_ROUTE: NEW_${params.advisorIntent} handler=missing_fields missing=${missingFields.join(
          ',',
        )} final_selected_handler=missing_fields`,
      );
      return this.buildScopedReply({
        intent: 'FALLBACK',
        text: this.buildMarketIntelligenceMissingFieldReply(missingFields),
        data: {
          required_fields: missingFields,
          current_session_last_property: effectiveProperty,
          context_state: params.state,
        },
      });
    }

    const resolvedCity = city || 'damascus';
    const resolvedPropertyType = propertyType as string;
    const resolvedAreaM2 = areaM2 as number;
    const resolvedAskPrice = askPrice as number;

    if (params.advisorIntent === 'PROPERTY_EVALUATION') {
      const evaluation = await this.advisorService.evaluateMarketPrice({
        city: resolvedCity,
        district,
        property_type: resolvedPropertyType,
        area_m2: resolvedAreaM2,
        bedrooms,
        ask_price: resolvedAskPrice,
      });
      this.logger.log('CHAT_ROUTE: NEW_PROPERTY_EVALUATION handler=advisor.evaluateMarketPrice final_selected_handler=advisor.evaluateMarketPrice');
      return this.buildScopedReply({
        intent: 'BUYER_EVALUATE',
        text: this.buildEvaluationReply({
          estimatedPrice: evaluation.estimated_price,
          evaluation: evaluation.evaluation,
          confidence: evaluation.confidence,
          differencePercent: evaluation.difference_percent,
        }),
        data: {
          market_evaluation: evaluation,
          current_session_last_property: effectiveProperty,
        },
      });
    }

    const investment = await this.advisorService.investmentAnalysis({
      city: resolvedCity,
      district: district!,
      property_type: resolvedPropertyType,
      area_m2: resolvedAreaM2,
      bedrooms,
      ask_price: resolvedAskPrice,
    });
    this.logger.log(
      'CHAT_ROUTE: NEW_INVESTMENT_ANALYSIS handler=advisor.investmentAnalysis final_selected_handler=advisor.investmentAnalysis',
    );
    return this.buildScopedReply({
      intent: 'BUYER_EVALUATE',
      text: this.buildInvestmentReply(investment),
      data: {
        investment_analysis: investment,
        current_session_last_property: effectiveProperty,
      },
    });
  }

  private handleStaticAiFailure(language: RealEstateLanguage): DispatchResult {
    return this.buildScopedReply({
      intent: 'FALLBACK',
      text:
        language === 'ar'
          ? 'أستطيع مساعدتك في التسعير وتحليل السوق ومقارنة المناطق وخطة البيع أو الشراء. إذا ذكرت المنطقة ونوع العقار والمساحة أو السعر المطلوب سأعطيك جواباً عملياً مباشرة.'
          : 'I can help with pricing, market analysis, district comparison, and buy/sell strategy. Share the district, property type, size, or asking price and I will give you a practical real-estate answer.',
      data: null,
    });
  }

  private async composeOwnerReply(params: {
    mode:
      | 'GREETING'
      | 'OUT_OF_SCOPE'
      | 'PRICE_ESTIMATION'
      | 'SELLER_GUIDANCE'
      | 'REAL_ESTATE_FAQ';
    language: RealEstateLanguage;
    userMessage: string;
    draft: string;
    facts: Record<string, unknown>;
    lockedValues?: Array<string | number>;
  }): Promise<string> {
    const aiService = this.getAiService();
    if (!aiService) {
      return params.draft;
    }

    return aiService.composeRealEstateAnswer({
      mode: params.mode,
      language: params.language,
      userMessage: params.userMessage,
      draft: params.draft,
      facts: params.facts,
      lockedValues: params.lockedValues,
    });
  }

  private getAiService(): AiService | null {
    if (this.aiService) {
      return this.aiService;
    }
    if (this.aiInitTried) {
      return this.localAiService;
    }

    this.aiInitTried = true;
    try {
      const ragService = new RagService(this.prisma);
      const marketBrainService = new MarketBrainService(this.prisma);
      this.localAiService = new AiService(ragService, marketBrainService);
    } catch {
      this.localAiService = null;
    }

    return this.localAiService;
  }

  private async handlePropertyStrategy(params: {
    ownerId: number;
    propertyId: number;
    message: string;
  }): Promise<DispatchResult> {
    const parsedArabic = parseArabicMessage(params.message);
    const daysWindow = this.resolveDaysWindow(parsedArabic.days_window);

    const strategy = await this.ownerStrategyService.getStrategy({
      propertyId: params.propertyId,
      requester: { sub: params.ownerId, role: 'OWNER' },
      daysWindow,
    });

    const seller = strategy.seller;
    const confidence = Number(seller?.confidence || 0);
    const hint = confidence < 0.4 ? this.buildConfidenceHint(seller?.confidence_meta) : undefined;
    const logId = String(strategy.strategy_log_id || '').trim();

    const suggestedActions: SuggestedAction[] = [];
    const recFast = Number(strategy?.recommendations?.fast?.target_price_syp || 0);
    const recBalanced = Number(strategy?.recommendations?.balanced?.target_price_syp || 0);
    const recProfit = Number(strategy?.recommendations?.profit?.target_price_syp || 0);

    if (recFast > 0) {
      suggestedActions.push({
        type: 'APPLY_PRICE',
        label_ar: 'طبّق السعر السريع',
        property_id: params.propertyId,
        price: recFast,
        ...(logId ? { log_id: logId, track_action: 'accepted_fast' } : {}),
      });
    }
    if (recBalanced > 0) {
      suggestedActions.push({
        type: 'APPLY_PRICE',
        label_ar: 'طبّق السعر المتوازن',
        property_id: params.propertyId,
        price: recBalanced,
        ...(logId ? { log_id: logId, track_action: 'accepted_balanced' } : {}),
      });
    }
    if (recProfit > 0) {
      suggestedActions.push({
        type: 'APPLY_PRICE',
        label_ar: 'طبّق سعر الربح',
        property_id: params.propertyId,
        price: recProfit,
        ...(logId ? { log_id: logId, track_action: 'accepted_profit' } : {}),
      });
    }
    suggestedActions.push({
      type: 'OPEN_STRATEGY',
      label_ar: 'افتح مركز الاستراتيجية',
      url: `/owner/properties/${params.propertyId}/strategy`,
      property_id: params.propertyId,
    });

    return {
      response: {
        intent: 'PROPERTY_STRATEGY',
        text_ar: await this.composeOwnerReply({
          mode: 'SELLER_GUIDANCE',
          language: 'ar',
          userMessage: params.message,
          draft: [
          `عنوان: استراتيجية العقار #${params.propertyId}`,
          `- السعر الأمثل: ${this.formatSyp(seller?.optimal_price_syp)} ل.س`,
          `- سعر البيع السريع: ${this.formatSyp(seller?.fast_sale_price_syp)} ل.س`,
          `- الثقة: ${(confidence * 100).toFixed(1)}%`,
          `- الانحراف الحالي: ${Number(strategy.simulation?.deviation_percent || 0).toFixed(1)}%`,
          ...(hint ? [`- تنبيه: ${hint}`] : []),
          ].join('\n'),
          facts: {
            property_id: params.propertyId,
            optimal_price_syp: seller?.optimal_price_syp,
            fast_sale_price_syp: seller?.fast_sale_price_syp,
            confidence_pct: Number((confidence * 100).toFixed(1)),
            deviation_percent: Number(strategy.simulation?.deviation_percent || 0).toFixed(1),
          },
          lockedValues: [
            params.propertyId,
            seller?.optimal_price_syp || '',
            seller?.fast_sale_price_syp || '',
            Number((confidence * 100).toFixed(1)),
          ],
        }),
        data: {
          property: strategy.property,
          seller: strategy.seller,
          insights: strategy.insights,
          simulation: strategy.simulation,
          recommendations: strategy.recommendations,
          objections: strategy.objections,
          strategy_log_id: strategy.strategy_log_id,
        },
        suggested_actions: suggestedActions,
      },
      toolMessages: [
        {
          toolName: 'owner_strategy',
          text: 'TOOL owner_strategy executed',
          payloadJson: {
            toolName: 'owner_strategy',
            toolInput: { propertyId: params.propertyId, days_window: daysWindow },
            toolResultSnapshot: {
              strategy_log_id: strategy.strategy_log_id || null,
              seller: {
                optimal_price_syp: seller?.optimal_price_syp,
                fast_sale_price_syp: seller?.fast_sale_price_syp,
                confidence: seller?.confidence,
                confidence_meta: seller?.confidence_meta,
              },
              simulation: {
                deviation_percent: strategy.simulation?.deviation_percent,
                risk_score: strategy.simulation?.risk_score,
              },
            },
          },
        },
      ],
    };
  }

  private async handleSuggestions(ownerId: number, message: string): Promise<DispatchResult> {
    const parsedArabic = parseArabicMessage(message);
    const daysWindow = this.resolveDaysWindow(parsedArabic.days_window);
    const queue = await this.ownerSuggestionsService.getSuggestions({ ownerId, daysWindow, limit: 10 });

    const top = (queue.items || []).slice(0, 5);
    const lines = top.map((item: any, idx: number) => {
      const title = item?.property?.title || `#${item?.property?.id}`;
      const action = item?.action?.title_ar || 'لا يوجد إجراء';
      return `${idx + 1}. ${title} — ${action}`;
    });

    const applyActions: SuggestedAction[] = top
      .filter((item: any) => Number(item?.action?.recommended_price_syp || 0) > 0)
      .map((item: any) => ({
        type: 'APPLY_PRICE',
        label_ar: `طبّق السعر: ${item?.property?.title || `#${item?.property?.id}`}`,
        property_id: Number(item?.property?.id),
        price: Number(item?.action?.recommended_price_syp),
        ...(item?.log_id
          ? {
              log_id: String(item.log_id),
              track_action:
                item?.action?.code === 'apply_fast'
                  ? 'accepted_fast'
                  : item?.action?.code === 'apply_profit'
                    ? 'accepted_profit'
                    : 'accepted_balanced',
            }
          : {}),
      }));

    return {
      response: {
        intent: 'SUGGESTIONS_QUEUE',
        text_ar: ['عنوان: مهامك الذكية', ...(lines.length > 0 ? lines : ['- لا توجد مهام حالياً.'])].join('\n'),
        data: { days_window: queue.days_window, items: top },
        suggested_actions: [
          ...applyActions.slice(0, 2),
          { type: 'OPEN_SUGGESTIONS', label_ar: 'افتح صفحة المهام الذكية', url: '/owner/suggestions' },
        ],
      },
      toolMessages: [
        {
          toolName: 'owner_suggestions',
          text: 'TOOL owner_suggestions executed',
          payloadJson: {
            toolName: 'owner_suggestions',
            toolInput: { days_window: daysWindow, limit: 10 },
            toolResultSnapshot: {
              total: Number(queue.items?.length || 0),
              top: top.map((item: any) => ({
                property_id: item?.property?.id,
                action_code: item?.action?.code,
                recommended_price_syp: item?.action?.recommended_price_syp ?? null,
                priority_score: item?.priority?.score ?? null,
                log_id: item?.log_id ?? null,
              })),
            },
          },
        },
      ],
    };
  }

  private async handlePortfolio(ownerId: number, message: string): Promise<DispatchResult> {
    const parsedArabic = parseArabicMessage(message);
    const daysWindow = this.resolveDaysWindow(parsedArabic.days_window);
    const portfolio = await this.ownerPortfolioService.getPortfolio({ ownerId, daysWindow, limit: 10 });

    const top = (portfolio.items || [])
      .filter((item: any) => item?.ai?.status !== 'missing_fields')
      .sort((a: any, b: any) => Number(b?.ai?.priority?.score || 0) - Number(a?.ai?.priority?.score || 0))
      .slice(0, 5);

    const lines = top.map(
      (item: any, idx: number) =>
        `${idx + 1}. ${item?.property?.title || `#${item?.property?.id}`} — ${(Number(item?.ai?.priority?.score || 0) * 100).toFixed(1)}%`,
    );

    return {
      response: {
        intent: 'PORTFOLIO',
        text_ar: ['عنوان: ملخص المحفظة', ...(lines.length > 0 ? lines : ['- لا توجد عناصر قابلة للتحليل.'])].join('\n'),
        data: { days_window: portfolio.days_window, items: (portfolio.items || []).slice(0, 10) },
        suggested_actions: [{ type: 'OPEN_PORTFOLIO', label_ar: 'افتح ذكاء محفظتي', url: '/owner/portfolio' }],
      },
      toolMessages: [
        {
          toolName: 'owner_portfolio',
          text: 'TOOL owner_portfolio executed',
          payloadJson: {
            toolName: 'owner_portfolio',
            toolInput: { days_window: daysWindow, limit: 10 },
            toolResultSnapshot: {
              total: Number(portfolio.items?.length || 0),
              top: top.map((item: any) => ({
                property_id: item?.property?.id,
                priority_score: item?.ai?.priority?.score ?? null,
                priority_label: item?.ai?.priority?.label ?? null,
              })),
            },
          },
        },
      ],
    };
  }

  private async handleMarketInsights(params: {
    ownerId: number;
    message: string;
    propertyId?: number;
  }): Promise<DispatchResult> {
    const explicit = this.extractGeoInputs(params.message);
    const parsedArabic = parseArabicMessage(params.message);

    let contextProperty: OwnedProperty | null = null;
    if (params.propertyId) {
      contextProperty = await this.getOwnedProperty(params.ownerId, params.propertyId);
    }

    const city = explicit.city || parsedArabic.city || (contextProperty?.city ? String(contextProperty.city) : undefined);
    const district =
      explicit.district || parsedArabic.district || (contextProperty?.address ? String(contextProperty.address) : undefined);
    const propertyType = explicit.property_type || parsedArabic.property_type || this.mapPropertyType(contextProperty?.type);
    const daysWindow = this.resolveDaysWindow(parsedArabic.days_window);

    if (!city) {
      return {
        response: {
          intent: 'MARKET_WATCH_INSIGHTS',
          text_ar:
            'عنوان: مطلوب بيانات المنطقة\n- أرسل city:damascus\n- ويمكنك إضافة district و property_type.',
          data: null,
          suggested_actions: [
            {
              type: 'ASK_FOR_FIELDS',
              label_ar: 'أضف city أو اختر عقارًا من القائمة',
              note: 'city مطلوب، district و property_type اختيارية',
            },
          ],
        },
        toolMessages: [],
      };
    }

    const insights = await this.advisorService.getInsights({
      city,
      district,
      property_type: propertyType || undefined,
      days_window: daysWindow,
    });

    return {
      response: {
        intent: 'MARKET_WATCH_INSIGHTS',
        text_ar: [
          'عنوان: ملخص السوق',
          `- الوسيط: ${this.formatSyp(insights.stats.median_ppm2_syp)} ل.س/م²`,
          `- المتوسط: ${this.formatSyp(insights.stats.avg_ppm2_syp)} ل.س/م²`,
          `- التذبذب: ${(Number(insights.stats.volatility_index || 0) * 100).toFixed(1)}%`,
          `- الاتجاه: ${this.trendAr(insights.stats.trend_last_30_days?.direction)}`,
        ].join('\n'),
        data: insights as unknown as Record<string, unknown>,
        suggested_actions: [
          { type: 'OPEN_PORTFOLIO', label_ar: 'افتح ذكاء محفظتي', url: '/owner/portfolio' },
          { type: 'OPEN_STRATEGY', label_ar: 'افتح مركز الاستراتيجية', url: '/owner/properties' },
        ],
      },
      toolMessages: [
        {
          toolName: 'advisor_insights',
          text: 'TOOL advisor_insights executed',
          payloadJson: {
            toolName: 'advisor_insights',
            toolInput: {
              city,
              ...(district ? { district } : {}),
              ...(propertyType ? { property_type: propertyType } : {}),
              days_window: daysWindow,
            },
            toolResultSnapshot: {
              sample_count: insights.sample_count,
              stats: insights.stats,
              confidence_meta: insights.confidence_meta ?? null,
            },
          },
        },
      ],
    };
  }

  private async handleHistory(ownerId: number, message: string): Promise<DispatchResult> {
    const parsedArabic = parseArabicMessage(message);
    const days = this.resolveDaysWindow(parsedArabic.days_window);
    const history = await this.ownerAiHistoryService.getHistory({ ownerId, days, limit: 10 });

    const top = (history.items || []).slice(0, 5);
    const lines = top.map(
      (item, idx) =>
        `${idx + 1}. ${item.endpoint} — ${item.outcome?.action || 'بدون نتيجة'} (${new Date(item.created_at).toLocaleDateString('en-GB')})`,
    );

    return {
      response: {
        intent: 'AI_HISTORY',
        text_ar: ['عنوان: سجل Urbanex AI', ...(lines.length ? lines : ['- لا توجد نتائج بعد.'])].join('\n'),
        data: { days: history.days, limit: history.limit, items: top },
        suggested_actions: [{ type: 'OPEN_HISTORY', label_ar: 'افتح سجل Urbanex AI', url: '/owner/ai-history' }],
      },
      toolMessages: [
        {
          toolName: 'owner_ai_history',
          text: 'TOOL owner_ai_history executed',
          payloadJson: {
            toolName: 'owner_ai_history',
            toolInput: { days, limit: 10 },
            toolResultSnapshot: {
              total: Number(history.items?.length || 0),
              top: top.map((item) => ({
                log_id: item.log_id,
                endpoint: item.endpoint,
                outcome: item.outcome?.action || null,
              })),
            },
          },
        },
      ],
    };
  }

  private handleFallback(): DispatchResult {
    return {
      response: {
        intent: 'FALLBACK',
        text_ar: [
          'عنوان: اختر مهمة واضحة',
          '- للتسعير: اختر عقارًا ثم اكتب "قيّم سعر عقار".',
          '- للمهام: اكتب "مهامي".',
          '- للسوق: اكتب "مراقبة السوق city:damascus district:mazzeh property_type:apartment".',
        ].join('\n'),
        data: null,
        suggested_actions: [
          { type: 'ASK_FOR_FIELDS', label_ar: 'قيّم سعر عقار', note: 'اختر عقارًا أولاً من القائمة' },
          { type: 'ASK_FOR_FIELDS', label_ar: 'اعطني مهامي الذكية' },
          { type: 'ASK_FOR_FIELDS', label_ar: 'محفظتي' },
          { type: 'ASK_FOR_FIELDS', label_ar: 'سجل urbanex' },
          {
            type: 'ASK_FOR_FIELDS',
            label_ar: 'ملخص السوق للمنطقة',
            note: 'مثال: city:damascus district:mazzeh property_type:apartment',
          },
        ],
      },
      toolMessages: [],
    };
  }

  private async assertOwnerSession(ownerId: number, sessionId: number) {
    const sessionDelegate = (this.prisma as any).chatSession;
    const session = await sessionDelegate.findUnique({
      where: { id: sessionId },
      select: { id: true, ownerId: true, title: true, status: true, metaJson: true },
    });
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }
    if (Number(session.ownerId) !== Number(ownerId)) {
      throw new ForbiddenException('You cannot access this chat session');
    }
    return session;
  }

  private async getOwnedProperty(ownerId: number, propertyId: number): Promise<OwnedProperty> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        ownerId: true,
        title: true,
        city: true,
        address: true,
        type: true,
        area: true,
        price: true,
      },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    if (Number(property.ownerId) !== Number(ownerId)) {
      throw new ForbiddenException('Property does not belong to this owner');
    }
    return property;
  }

  private async resolveTrackingFromSession(params: {
    sessionId: number;
    propertyId: number;
    price: number;
  }): Promise<{ logId?: string; action?: TrackAction } | null> {
    const messageDelegate = (this.prisma as any).chatMessage;
    const latestAssistant = await messageDelegate.findFirst({
      where: {
        sessionId: params.sessionId,
        role: 'ASSISTANT',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        payloadJson: true,
      },
    });

    const payload = this.toRecord(latestAssistant?.payloadJson);
    if (!payload) return null;

    const suggestedActions = Array.isArray(payload.suggested_actions)
      ? (payload.suggested_actions as Record<string, unknown>[])
      : [];

    for (const action of suggestedActions) {
      if (String(action?.type || '') !== 'APPLY_PRICE') continue;
      const actionPropertyId = Number(action?.property_id || 0);
      const actionPrice = Number(action?.price || 0);
      if (actionPropertyId !== params.propertyId) continue;
      if (Math.abs(actionPrice - params.price) > 1) continue;

      const logId = String(action?.log_id || '').trim();
      const trackAction = String(action?.track_action || '').trim();
      if (!logId || !trackAction) return null;

      if (
        trackAction === 'accepted_fast' ||
        trackAction === 'accepted_balanced' ||
        trackAction === 'accepted_profit' ||
        trackAction === 'accepted_optimal'
      ) {
        return {
          logId,
          action: trackAction,
        };
      }
    }

    return null;
  }

  private async getLatestAssistantMessage(sessionId: number): Promise<AssistantTurnContext> {
    const messageDelegate = (this.prisma as any).chatMessage;
    const latestAssistant = await messageDelegate.findFirst({
      where: {
        sessionId,
        role: 'ASSISTANT',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        text: true,
        payloadJson: true,
      },
    });

    if (!latestAssistant) {
      return null;
    }

    return {
      text: String(latestAssistant.text || ''),
      payloadJson: this.toRecord(latestAssistant.payloadJson),
    };
  }

  private async getRecentConversationHistory(
    sessionId: number,
    limit = 6,
  ): Promise<AiConversationTurn[]> {
    const messageDelegate = (this.prisma as any).chatMessage;
    const rows = await messageDelegate.findMany({
      where: {
        sessionId,
        role: {
          in: ['USER', 'ASSISTANT'],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        role: true,
        text: true,
      },
    });

    return rows
      .reverse()
      .map((row: { role: string; text: string }) => ({
        role: row.role === 'USER' ? 'user' : 'assistant',
        content: String(row.text || '').trim(),
      }))
      .filter((row) => row.content.length > 0);
  }

  private lastAssistantAskedQuestion(lastAssistant: AssistantTurnContext): boolean {
    if (!lastAssistant?.text) {
      return false;
    }

    if (/[؟?]\s*$/.test(lastAssistant.text.trim())) {
      return true;
    }

    const payload = lastAssistant.payloadJson;
    return Array.isArray(payload?.suggested_actions) && payload.suggested_actions.length > 0;
  }

  private mapPropertyType(type?: string | null): string | null {
    const key = String(type || '').toUpperCase();
    if (key === 'APARTMENT') return 'apartment';
    if (key === 'HOUSE') return 'house';
    if (key === 'VILLA') return 'villa';
    if (key === 'STUDIO') return 'studio';
    if (key === 'LAND') return 'land';
    return null;
  }

  private extractGeoInputs(message: string): {
    city?: string;
    district?: string;
    property_type?: string;
  } {
    return {
      city: this.extractToken(message, ['city', 'مدينة']),
      district: this.extractToken(message, ['district', 'منطقة', 'المنطقة']),
      property_type: this.extractToken(message, ['property_type', 'type', 'نوع']),
    };
  }

  private extractToken(message: string, keys: string[]): string | undefined {
    for (const key of keys) {
      const pattern = new RegExp(`(?:${key})\\s*[:=]\\s*([^,،\\n]+)`, 'i');
      const match = message.match(pattern);
      if (match?.[1]) {
        const value = match[1].trim();
        if (value) return value;
      }
    }
    return undefined;
  }

  private isRealEstateFlow(params: {
    message: string;
    explicit: { city?: string; district?: string; property_type?: string };
    parsedArabic: ReturnType<typeof parseArabicMessage>;
  }): boolean {
    if (
      params.explicit.city ||
      params.explicit.district ||
      params.explicit.property_type ||
      params.parsedArabic.city ||
      params.parsedArabic.district ||
      params.parsedArabic.property_type ||
      params.parsedArabic.area_m2 != null ||
      params.parsedArabic.budget_syp != null
    ) {
      return true;
    }

    const text = this.normalizeText(params.message);
    return /(بيع|شراء|سعر|تقييم|قيم|عقار|شقة|فيلا|متر|m2|مليون|سوق|market|price|sell|buy|mazzeh|المزة|مزة|mazeeh)/i.test(
      text,
    );
  }

  private buildScopedReply(params: {
    intent: OwnerChatIntent;
    text: string;
    data: Record<string, unknown> | null;
  }): DispatchResult {
    return {
      response: {
        intent: params.intent,
        text_ar: params.text,
        data: params.data,
        suggested_actions: [],
      },
      toolMessages: [],
    };
  }

  private pickPropertyState(
    input: Partial<
      ExtractedPropertyData & {
        budget_syp?: number;
      }
    >,
  ): ExtractedPropertyData {
    return {
      ...(this.cleanString(input.city) ? { city: this.cleanString(input.city) } : {}),
      ...(this.cleanString(input.district)
        ? { district: this.cleanString(input.district) }
        : {}),
      ...(this.cleanString(input.property_type)
        ? { property_type: this.cleanString(input.property_type) }
        : {}),
      ...(this.toPositiveNumber(input.area_m2) != null
        ? { area_m2: this.toPositiveNumber(input.area_m2) }
        : {}),
      ...(this.toPositiveNumber(input.bedrooms) != null
        ? { bedrooms: this.toPositiveNumber(input.bedrooms) }
        : {}),
      ...(this.toPositiveNumber(input.ask_price ?? input.budget_syp) != null
        ? { ask_price: this.toPositiveNumber(input.ask_price ?? input.budget_syp) }
        : {}),
    };
  }

  private isClearPropertyContinuation(params: {
    message: string;
    lastAssistant: AssistantTurnContext;
  }): boolean {
    const text = this.normalizeText(params.message);
    const shortFollowUp =
      /^(طيب|تمام|اوكي|أوكي|نعم|اي|yes|ok|okay|لا|مو هلق|كم سعره|كم سعرها|سعره|سعرها|هل هي صفقة|هل هاد صفقة|للشراء|للبيع|للايجار|للإيجار)$/.test(
        text,
      ) || /^(في|ب)\s+\S+/.test(text);

    return shortFollowUp && this.lastAssistantAskedQuestion(params.lastAssistant);
  }

  private buildMarketIntelligenceMissingFieldReply(missingFields: string[]): string {
    const missing = new Set(missingFields);
    if (missing.has('property_type')) {
      return 'ما نوع العقار؟ مثال: شقة أو فيلا أو منزل.';
    }
    if (missing.has('district')) {
      return 'حتى أحلل الاستثمار بدقة أحتاج اسم المنطقة فقط. مثال: المزة أو كفرسوسة.';
    }
    if (missing.has('district_or_city')) {
      return 'أرسل لي المنطقة أو المدينة حتى أقدر أحلل العقار بدقة.';
    }
    if (missing.has('area_m2')) {
      return 'كم مساحة العقار بالمتر؟ مثال: 120 متر.';
    }
    if (missing.has('ask_price')) {
      return 'ما هو سعر العرض الحالي؟';
    }
    return 'أرسل لي نوع العقار + المنطقة + المساحة + سعر العرض، مثال: شقة بالمزة 120 متر سعرها 135000';
  }

  private buildPartialPropertyStateReply(
    currentPropertyState: ExtractedPropertyData,
  ): string {
    const missing: string[] = [];
    if (!currentPropertyState.property_type) {
      missing.push('نوع العقار');
    }
    if (!currentPropertyState.district && !currentPropertyState.city) {
      missing.push('المنطقة');
    }
    if (!this.toPositiveNumber(currentPropertyState.area_m2)) {
      missing.push('المساحة');
    }
    if (!this.toPositiveNumber(currentPropertyState.ask_price)) {
      missing.push('سعر العرض');
    }

    if (missing.length === 0) {
      return 'تمام. أصبحت بيانات العقار مكتملة تقريباً. إذا أردت التقييم أو تحليل الاستثمار اكتب لي السعر مع سؤالك مباشرة.';
    }

    return `تمام. أرسل لي ${missing.join(' + ')} حتى أقدر أقيمه بدقة.`;
  }

  private sanitizePartialPropertyStateForReply(params: {
    explicitProperty: ExtractedPropertyData;
    currentPropertyState: ExtractedPropertyData;
  }): ExtractedPropertyData {
    const sanitized = { ...params.currentPropertyState };
    const locationAnchor = Boolean(
      params.explicitProperty.city || params.explicitProperty.district,
    );

    if (locationAnchor && !params.explicitProperty.property_type) {
      delete sanitized.property_type;
    }
    if (locationAnchor && !this.toPositiveNumber(params.explicitProperty.area_m2)) {
      delete sanitized.area_m2;
    }
    if (locationAnchor && !this.toPositiveNumber(params.explicitProperty.ask_price)) {
      delete sanitized.ask_price;
    }

    return sanitized;
  }

  private isInvestmentPriorityMessage(message: string): boolean {
    const normalized = this.normalizeText(message);
    return /(هل هي صفقة|هل هي صفقه|هل هذا استثمار جيد|هل هاد استثمار جيد|تنصح اشتريه|تنصح أشتريه|تنصح بشرائه|تنصح بشراءه|مناسب للاستثمار|استثمار جيد)/i.test(
      normalized,
    );
  }

  private isPartialPropertyStateUpdate(params: {
    message: string;
    state: DeterministicContextState;
    explicitProperty: ExtractedPropertyData;
    currentPropertyState: ExtractedPropertyData;
  }): boolean {
    const normalized = this.normalizeText(params.message);
    const hasPropertyAnchor = Boolean(
      params.explicitProperty.city ||
        params.explicitProperty.district ||
        params.explicitProperty.property_type ||
        params.explicitProperty.area_m2 ||
        /(عندي عقار|عندي شقه|عندي شقة|عقار|شقه|شقة|فيلا|بيت|منزل|ارض|أرض|مساحته|مساحتها)/i.test(
          normalized,
        ),
    );
    const asksForPricing = Boolean(
      params.explicitProperty.ask_price ||
        this.isInvestmentPriorityMessage(params.message) ||
        /(هل السعر مناسب|كم سعر|تقييم|تسعير|صفقه|صفقة|استثمار|كيف السوق|وضع السوق|خطة السوق|اغلي|أغلى|اغلى|أفضل مناطق|افضل مناطق)/i.test(
          normalized,
        ),
    );

    return hasPropertyAnchor && !asksForPricing;
  }

  private buildEvaluationReply(params: {
    estimatedPrice: number;
    evaluation: 'underpriced' | 'fair_price' | 'overpriced';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
    differencePercent: number;
  }): string {
    const evaluationText =
      params.evaluation === 'overpriced'
        ? 'أعلى من السوق'
        : params.evaluation === 'underpriced'
          ? 'أقل من السوق'
          : 'قريب من السوق';
    const confidenceText =
      params.confidence === 'HIGH'
        ? 'عالي'
        : params.confidence === 'MEDIUM'
          ? 'متوسط'
          : params.confidence === 'LOW'
            ? 'منخفض'
            : 'منخفض جدًا';

    return `بعد تحليل السوق، السعر المتوقع لهذا العقار حوالي ${Math.round(
      params.estimatedPrice,
    )} دولار. السعر الحالي ${evaluationText}، لذلك التقييم هو ${params.evaluation}. مستوى الثقة: ${confidenceText}. فرق السعر التقريبي ${Math.abs(
      params.differencePercent,
    ).toFixed(2)}%.`;
  }

  private buildInvestmentReply(params: {
    estimated_price: number;
    evaluation: 'underpriced' | 'fair_price' | 'overpriced';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
    difference_percent: number;
    investment_score: number;
    market_status: 'HOT' | 'STABLE' | 'UNDERVALUED';
    advice: string;
  }): string {
    const investmentLabel =
      params.investment_score >= 8
        ? 'استثمار جيد'
        : params.investment_score >= 6
          ? 'استثمار متوسط'
          : 'استثمار ضعيف نسبيًا';

    return `العقار يبدو ${investmentLabel}. السعر السوقي التقديري حوالي ${Math.round(
      params.estimated_price,
    )} دولار، وتصنيف السعر الحالي هو ${params.evaluation}. تقييم الاستثمار: ${params.investment_score} من 10. حالة السوق في المنطقة: ${params.market_status}. ${params.advice}`;
  }

  private buildHeatmapReply(params: {
    city: string;
    message: string;
    districts: Array<{
      district: string;
      avg_price_per_m2: number;
      market_status: 'HOT' | 'STABLE' | 'UNDERVALUED';
    }>;
  }): string {
    const normalizedMessage = this.normalizeText(params.message);
    const undervaluedOnly = /undervalued|ارخص|اقل المناطق سعرا|أقل المناطق سعرا/.test(
      normalizedMessage,
    );
    const hotOnly = /اغلى|أغلى|best areas|افضل مناطق|أفضل مناطق|investment/.test(
      normalizedMessage,
    );
    const ranked = [...params.districts]
      .filter((item) =>
        undervaluedOnly ? item.market_status === 'UNDERVALUED' : true,
      )
      .sort((a, b) =>
        undervaluedOnly
          ? a.avg_price_per_m2 - b.avg_price_per_m2
          : b.avg_price_per_m2 - a.avg_price_per_m2,
      )
      .slice(0, 3);

    const lines = ranked.map(
      (item, index) =>
        `${index + 1}. ${item.district} — ${this.describeMarketStatus(item.market_status)}`,
    );

    const intro = hotOnly
      ? `أفضل المناطق حالياً في ${params.city}:`
      : undervaluedOnly
        ? `أبرز المناطق الأقل من متوسط السوق حالياً في ${params.city}:`
        : `خريطة السوق الحالية في ${params.city}:`;

    return [intro, ...lines].join('\n');
  }

  private describeMarketStatus(status: 'HOT' | 'STABLE' | 'UNDERVALUED'): string {
    if (status === 'HOT') {
      return 'سوق ساخن وطلب مرتفع';
    }
    if (status === 'UNDERVALUED') {
      return 'منطقة undervalued وقد ترتفع لاحقًا';
    }
    return 'سوق مستقر';
  }

  private normalizeText(value: string): string {
    return String(value || '')
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private mergeDeterministicState(params: {
    metaJson: unknown;
    parsedArabic: ReturnType<typeof parseArabicMessage>;
    extractedProperty: ExtractedPropertyData;
    contextProperty: OwnedProperty | null;
    message: string;
    lastAssistant: AssistantTurnContext;
  }): DeterministicContextState {
    const ctx = this.toRecord(this.toRecord(params.metaJson)?.context) || {};
    const parsed = params.parsedArabic;
    const extracted = params.extractedProperty;
    const propertyTypeFromProperty = this.mapPropertyType(params.contextProperty?.type);
    const clearContinuation = this.isClearPropertyContinuation({
      message: params.message,
      lastAssistant: params.lastAssistant,
    });
    const hasFreshPropertyAnchor = Boolean(
      this.cleanString(extracted.city) ||
        this.cleanString(extracted.district) ||
        this.cleanString(extracted.property_type) ||
        this.toPositiveNumber(extracted.area_m2) != null ||
        parsed.city ||
        parsed.district ||
        parsed.property_type ||
        this.toPositiveNumber(parsed.area_m2) != null,
    );
    const preserveNumericContext = clearContinuation || !hasFreshPropertyAnchor;

    const merged: DeterministicContextState = {
      city:
        this.cleanString(extracted.city) ||
        parsed.city ||
        this.cleanString(ctx.city) ||
        this.cleanString(params.contextProperty?.city) ||
        undefined,
      district:
        this.cleanString(extracted.district) ||
        parsed.district ||
        this.cleanString(ctx.district) ||
        this.cleanString(params.contextProperty?.address) ||
        undefined,
      property_type:
        this.cleanString(extracted.property_type) ||
        parsed.property_type ||
        this.cleanString(ctx.property_type) ||
        propertyTypeFromProperty ||
        undefined,
      listing_intent:
        parsed.listing_intent ||
        this.normalizeListingIntent(ctx.listing_intent) ||
        undefined,
      area_m2:
        this.toPositiveNumber(extracted.area_m2) ??
        this.toPositiveNumber(parsed.area_m2) ??
        (preserveNumericContext ? this.toPositiveNumber(ctx.area_m2) : undefined) ??
        this.toPositiveNumber(params.contextProperty?.area) ??
        undefined,
      bedrooms:
        this.toPositiveNumber(extracted.bedrooms) ??
        (preserveNumericContext ? this.toPositiveNumber(ctx.bedrooms) : undefined) ??
        undefined,
      pending_slot:
        this.normalizePendingSlot(ctx.pending_slot) ??
        undefined,
      ask_price:
        this.toPositiveNumber(extracted.ask_price) ??
        (preserveNumericContext ? this.toPositiveNumber(ctx.ask_price) : undefined) ??
        undefined,
      budget_syp:
        this.toPositiveNumber(extracted.ask_price) ??
        this.toPositiveNumber(parsed.budget_syp) ??
        (preserveNumericContext ? this.toPositiveNumber(ctx.budget_syp) : undefined) ??
        undefined,
    };

    return merged;
  }

  private async persistSessionContextState(params: {
    sessionId: number;
    metaJson: unknown;
    propertyId: number | null;
    state: DeterministicContextState;
  }): Promise<void> {
    const sessionDelegate = (this.prisma as any).chatSession;
    const currentMeta = this.toRecord(params.metaJson) || {};
    const nextMeta = { ...currentMeta };
    const nextContext = this.toRecord(nextMeta.context) || {};

    if (params.propertyId == null) {
      delete nextContext.propertyId;
    } else {
      nextContext.propertyId = params.propertyId;
    }

    if (params.state.city) nextContext.city = params.state.city;
    if (params.state.district) nextContext.district = params.state.district;
    if (params.state.property_type) nextContext.property_type = params.state.property_type;
    if (params.state.listing_intent) nextContext.listing_intent = params.state.listing_intent;
    if (params.state.area_m2 != null) nextContext.area_m2 = params.state.area_m2;
    if (params.state.bedrooms != null) nextContext.bedrooms = params.state.bedrooms;
    if (params.state.ask_price != null) nextContext.ask_price = params.state.ask_price;
    if (params.state.budget_syp != null) nextContext.budget_syp = params.state.budget_syp;
    if (params.state.pending_slot) {
      nextContext.pending_slot = params.state.pending_slot;
      this.logger.log(`CHAT_ROUTE: PENDING_SLOT set slot=${params.state.pending_slot}`);
    } else {
      if (nextContext.pending_slot) {
        this.logger.log(
          `CHAT_ROUTE: PENDING_SLOT cleared previous=${String(nextContext.pending_slot)}`,
        );
      }
      delete nextContext.pending_slot;
    }

    if (Object.keys(nextContext).length > 0) {
      nextMeta.context = nextContext;
    } else {
      delete nextMeta.context;
    }

    await sessionDelegate.update({
      where: { id: params.sessionId },
      data: {
        metaJson: Object.keys(nextMeta).length > 0 ? nextMeta : null,
        updatedAt: new Date(),
      },
    });
  }

  private async persistSessionTaskState(params: {
    sessionId: number;
    intent: OwnerChatIntent;
    text: string;
  }): Promise<void> {
    if (
      params.intent !== 'SELLER_PRICE' &&
      params.intent !== 'BUYER_EVALUATE'
    ) {
      return;
    }

    const sessionDelegate = (this.prisma as any).chatSession;
    const existing = await sessionDelegate.findUnique({
      where: { id: params.sessionId },
      select: { metaJson: true },
    });
    const meta = this.toRecord(existing?.metaJson) || {};
    meta.last_task =
      params.intent === 'SELLER_PRICE'
        ? 'SELLER_PRICE_DONE'
        : 'BUYER_EVALUATE_DONE';
    meta.last_result_summary = String(params.text || '').slice(0, 280);

    await sessionDelegate.update({
      where: { id: params.sessionId },
      data: {
        metaJson: meta,
        updatedAt: new Date(),
      },
    });
  }

  private isSellerQuery(message: string): boolean {
    const text = String(message || '').toLowerCase();
    return (
      /بيع|ابيع|بدي بيع|سعر|تسعير|قيم|قيّم|تقييم|price|sell/.test(text)
    );
  }

  private normalizeListingIntent(
    value: unknown,
  ): 'SELL' | 'BUY' | 'RENT' | 'ESTIMATE' | 'INVEST' | undefined {
    const normalized = String(value || '').trim().toUpperCase();
    if (
      normalized === 'SELL' ||
      normalized === 'BUY' ||
      normalized === 'RENT' ||
      normalized === 'ESTIMATE' ||
      normalized === 'INVEST'
    ) {
      return normalized;
    }
    return undefined;
  }

  private normalizePendingSlot(
    value: unknown,
  ): 'ask_price' | 'area_m2' | 'property_type' | 'district' | 'city' | undefined {
    const normalized = String(value || '').trim().toLowerCase();
    if (
      normalized === 'ask_price' ||
      normalized === 'area_m2' ||
      normalized === 'property_type' ||
      normalized === 'district' ||
      normalized === 'city'
    ) {
      return normalized;
    }
    return undefined;
  }

  private toPositiveNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return undefined;
    }
    return parsed;
  }

  private cleanString(value: unknown): string | undefined {
    const normalized = String(value || '').trim();
    return normalized ? normalized : undefined;
  }

  private buildConfidenceHint(meta?: {
    sample_score?: number;
    recency_score?: number;
    stability_score?: number;
  }) {
    if (!meta) return 'الثقة منخفضة؛ يفضّل مراجعة المنطقة أو زيادة العينات.';
    const sample = Number(meta.sample_score ?? 0);
    const recency = Number(meta.recency_score ?? 0);
    const stability = Number(meta.stability_score ?? 0);
    if (sample <= recency && sample <= stability) {
      return 'الثقة منخفضة بسبب قلة العينات.';
    }
    if (recency <= sample && recency <= stability) {
      return 'الثقة منخفضة بسبب قدم البيانات.';
    }
    return 'الثقة منخفضة بسبب تذبذب السوق.';
  }

  private trendAr(direction?: string) {
    if (direction === 'up') return '↗ صاعد';
    if (direction === 'down') return '↘ هابط';
    return '→ مستقر';
  }

  private formatSyp(value: unknown): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return '0';
    return Math.round(parsed).toLocaleString('en-US');
  }

  private serializeMessage(row: {
    id: number;
    role: string;
    text: string;
    intent?: string | null;
    payloadJson?: unknown;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      role: row.role,
      text: row.text,
      content: row.text,
      intent: row.intent ?? null,
      payloadJson: row.payloadJson ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toRecord(value: unknown): Record<string, any> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, any>;
  }

  private extractExplainTrace(
    data: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    const record = this.toRecord(data);
    if (!record) return null;

    const direct = this.toRecord(record.explain_trace);
    if (direct) return direct;

    const aiPayload = this.toRecord(record.ai_payload);
    const fromAi = this.toRecord(aiPayload?.explain_trace);
    if (fromAi) return fromAi;

    return null;
  }

  private getSessionPropertyId(metaJson: unknown): number | null {
    const obj = this.toRecord(metaJson);
    const ctx = this.toRecord(obj?.context);
    const id = Number(ctx?.propertyId ?? 0);
    if (!Number.isInteger(id) || id <= 0) return null;
    return id;
  }

  private resolveDaysWindow(value?: number): number {
    const n = Number(value || 90);
    if (!Number.isFinite(n)) return 90;
    return Math.max(1, Math.min(365, Math.trunc(n)));
  }
}
