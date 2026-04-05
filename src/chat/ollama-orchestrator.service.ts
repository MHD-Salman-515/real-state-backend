import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  AiConversationTurn,
  AiService,
  buildOllamaSystemPrompt,
} from '../ai/ai.service';
import { AdvisorService } from '../advisor/advisor.service';
import { ChatIntentService, type ExtractedPropertyData } from './chat-intent.service';
import {
  buildOutOfScopeReply,
  classifyRealEstateRequest,
  extractComparisonTargets,
  type RealEstateLanguage,
} from '../chat-ux/real-estate-domain';
import { MarketStatsService } from '../market-intelligence/market-stats.service';

export type OrchestratorIntent =
  | 'GENERAL_CHAT'
  | 'PROPERTY_SEARCH'
  | 'PROPERTY_EVALUATION'
  | 'INVESTMENT_ANALYSIS'
  | 'MARKET_SUMMARY'
  | 'GENERAL_REAL_ESTATE_CHAT'
  | 'OUT_OF_SCOPE';

export type OwnerChatStateSnapshot = {
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

export type OrchestratorResult = {
  handled: boolean;
  responseIntent: 'BUYER_EVALUATE' | 'FALLBACK' | 'SMALL_TALK';
  text: string;
  data: Record<string, unknown> | null;
  route: string;
  responseSource: 'ollama' | 'formatter' | 'emergency_fallback';
};

@Injectable()
export class OllamaOrchestratorService {
  private readonly logger = new Logger(OllamaOrchestratorService.name);

  constructor(
    private readonly chatIntentService: ChatIntentService,
    private readonly advisorService: AdvisorService,
    private readonly marketStatsService: MarketStatsService,
    @Optional() private readonly aiService?: AiService,
  ) {}

  async orchestrateOwnerChat(params: {
    message: string;
    state: OwnerChatStateSnapshot;
    lastAssistantText?: string | null;
    recentHistory?: AiConversationTurn[];
    lastDeterministicResult?: boolean;
  }): Promise<OrchestratorResult> {
    const language = this.detectLanguage(params.message);
    const hasPendingSlot = Boolean(params.state.pending_slot);
    const explicitProperty = await this.chatIntentService.extractPropertyData(params.message);
    const clearContinuation = this.isClearPropertyContinuation(
      params.message,
      params.lastAssistantText,
    );
    const hasExplicitPropertyFacts = this.hasExplicitPropertyFacts(explicitProperty);
    const isPoliteSmallTalk = this.isPoliteSmallTalk(params.message);
    const detectedIntent = this.chatIntentService.detectIntent(params.message);
    const marketSummaryPriority = this.isMarketSummaryMessage(params.message);
    const domain = classifyRealEstateRequest({
      message: params.message,
      hasRealEstateContext: Boolean(
        params.state.listing_intent ||
          params.state.city ||
          params.state.district ||
          params.state.property_type ||
          params.state.area_m2 ||
          params.state.ask_price ||
          params.state.pending_slot,
      ),
      contextHints: [
        params.state.city || '',
        params.state.district || '',
        params.state.property_type || '',
        params.lastAssistantText || '',
      ].filter(Boolean),
    });

    const pendingSlot = params.state.pending_slot;
    const acknowledgement = this.isAcknowledgementMessage(params.message);
    const closureSmallTalk = this.isClosureSmallTalkMessage(params.message);
    const generalChat = this.isGeneralChatMessage(params.message);
    const comparisonIntent = this.isComparisonMessage(params.message);
    const marketGeneralIntent = this.isGeneralMarketChatMessage(params.message);
    const marketSummaryFollowUp = this.isMarketSummaryFollowUp(
      params.message,
      params.lastAssistantText,
      explicitProperty,
    );
    const investmentAreaAdviceIntent = this.isInvestmentAreaAdviceMessage(
      params.message,
      explicitProperty,
    );
    const followUpAfterResult =
      Boolean(params.lastDeterministicResult) &&
      this.isFollowUpAfterResultMessage(params.message);
    const propertySearchIntent = Boolean(
      !comparisonIntent &&
        !marketSummaryPriority &&
        !marketGeneralIntent &&
        !marketSummaryFollowUp &&
        !investmentAreaAdviceIntent &&
        (detectedIntent === 'PROPERTY_SEARCH' ||
          this.isPropertySearchContinuation(params.message, params.state) ||
          this.isPropertySearchIntent(domain.intent, params.message)),
    );

    if (acknowledgement) {
      this.logger.log('CHAT_MODE: GENERAL_CHAT_OLLAMA');
      this.logger.log('CHAT_MODE: GENERAL_CHAT_CONFIRMED');
      this.logger.log('OWNER_CHAT_MODE mode=ACKNOWLEDGEMENT');
      const text = await this.composeAcknowledgementReply({
        language,
        userMessage: params.message,
        recentHistory: params.recentHistory,
      });
      return {
        handled: true,
        responseIntent: 'SMALL_TALK',
        text,
        data: {
          context_state: {
            ...this.cleanState(params.state),
            pending_slot: pendingSlot,
          },
          current_session_last_property: this.cleanSlots(params.state),
        },
        route: 'acknowledgement_ollama',
        responseSource: this.aiService ? 'ollama' : 'emergency_fallback',
      };
    }

    if (closureSmallTalk && !hasExplicitPropertyFacts && !pendingSlot) {
      this.logger.log('CHAT_MODE: GENERAL_CHAT_OLLAMA');
      this.logger.log('CHAT_MODE: GENERAL_CHAT_CONFIRMED');
      this.logger.log('OWNER_CHAT_MODE mode=FOLLOW_UP_AFTER_RESULT');
      const text = await this.composeShortFollowUpReply({
        language,
        userMessage: params.message,
        recentHistory: params.recentHistory,
      });
      return {
        handled: true,
        responseIntent: 'SMALL_TALK',
        text,
        data: {
          context_state: {
            ...this.cleanState(params.state),
          },
          current_session_last_property: this.cleanSlots(params.state),
        },
        route: 'closure_small_talk',
        responseSource: this.aiService ? 'ollama' : 'emergency_fallback',
      };
    }

    if (followUpAfterResult) {
      this.logger.log('OWNER_CHAT_MODE mode=FOLLOW_UP_AFTER_RESULT');
      const text = await this.composeGeneralRealEstateReply({
        language,
        userMessage: params.message,
        lastProperty: this.cleanSlots(params.state),
        recentHistory: params.recentHistory,
      });
      return {
        handled: true,
        responseIntent: 'FALLBACK',
        text,
        data: {
          context_state: {
            ...this.cleanState(params.state),
            pending_slot: undefined,
          },
          current_session_last_property: this.cleanSlots(params.state),
        },
        route: 'follow_up_after_result',
        responseSource: this.aiService ? 'ollama' : 'emergency_fallback',
      };
    }

    if (generalChat) {
      this.logger.log('CHAT_MODE: GENERAL_CHAT_CONFIRMED');
      this.logger.log('OWNER_CHAT_MODE mode=GENERAL_CHAT');
      this.logger.log(
        pendingSlot
          ? 'CHAT_MODE: GENERAL_CHAT_OVERRIDES_PENDING'
          : 'CHAT_MODE: GENERAL_CHAT_OLLAMA',
      );
      const text = await this.composeGeneralChatReply({
        language,
        userMessage: params.message,
        recentHistory: params.recentHistory,
      });
      return {
        handled: true,
        responseIntent: 'SMALL_TALK',
        text,
        data: {
          context_state: {
            ...this.cleanState(params.state),
          },
          current_session_last_property: this.cleanSlots(params.state),
        },
        route: pendingSlot ? 'general_chat_overrides_pending' : 'general_chat_ollama',
        responseSource: this.aiService ? 'ollama' : 'emergency_fallback',
      };
    }

    if (this.isClearlyOffTopic(params.message)) {
      const text = await this.compose({
        mode: 'OUT_OF_SCOPE',
        language,
        userMessage: params.message,
        draft: buildOutOfScopeReply(language),
        facts: {
          redirect_topics:
            language === 'ar'
              ? ['شراء العقارات', 'بيع العقارات', 'التسعير', 'تحليل السوق']
              : ['buying', 'selling', 'pricing', 'market analysis'],
        },
        recentHistory: params.recentHistory,
      });
      this.logger.log('CHAT_MODE: OUT_OF_SCOPE');
      this.logger.log('OWNER_CHAT_MODE mode=OUT_OF_SCOPE');
      return {
        handled: true,
        responseIntent: 'FALLBACK',
        text,
        data: {
          context_state: {
            ...this.cleanState(params.state),
            pending_slot: undefined,
          },
        },
        route: 'out_of_scope_hard_stop',
        responseSource: this.aiService ? 'formatter' : 'emergency_fallback',
      };
    }

    if (pendingSlot && this.matchesPendingSlot(pendingSlot, explicitProperty)) {
      this.logger.log(
        `OLLAMA_ORCHESTRATOR_PENDING_SLOT extracted slot=${pendingSlot} value=${JSON.stringify(
          explicitProperty[pendingSlot],
        )}`,
      );
    }

    if (pendingSlot && isPoliteSmallTalk && !hasExplicitPropertyFacts) {
      this.logger.log(`OLLAMA_ORCHESTRATOR_PENDING_SLOT ignored_small_talk slot=${pendingSlot}`);
      this.logger.log('CHAT_MODE: GENERAL_CHAT_OVERRIDES_PENDING');
      const draft =
        language === 'ar'
          ? 'أهلاً. خذ راحتك، وعندما تصبح جاهزاً أرسل لي التفاصيل المتبقية وسأكمل التحليل مباشرة.'
          : 'Hello. When you are ready, send the remaining field and I will continue the analysis.';
      const text = await this.compose({
        mode: 'FOLLOW_UP_CONTEXTUAL',
        language,
        userMessage: params.message,
        draft,
        facts: {
          pending_slot: pendingSlot,
          known_fields: this.cleanSlots(params.state),
        },
        recentHistory: params.recentHistory,
      });
      this.logger.log('OLLAMA_ORCHESTRATOR_FINAL_RESPONSE route=pending_slot_small_talk');
      return {
        handled: true,
        responseIntent: 'SMALL_TALK',
        text,
        data: {
          context_state: {
            ...this.cleanState(params.state),
          },
          current_session_last_property: this.cleanSlots(params.state),
        },
        route: 'pending_slot_small_talk',
        responseSource: this.aiService ? 'formatter' : 'emergency_fallback',
      };
    }

    if (detectedIntent === 'MARKET_HEATMAP' && pendingSlot) {
      this.logger.log(
        `CHAT_ROUTE: MARKET_SUMMARY_OVERRIDE_PENDING previous_pending_slot=${pendingSlot}`,
      );
    }

    if (domain.domain === 'OUT_OF_SCOPE') {
      if (
        pendingSlot &&
        (hasExplicitPropertyFacts || clearContinuation || !this.isClearlyOffTopic(params.message))
      ) {
        this.logger.log(
          `OLLAMA_ORCHESTRATOR_INTENT intent=PENDING_SLOT_RECOVERY slot=${pendingSlot}`,
        );
      } else {
        const text = await this.compose({
          mode: 'OUT_OF_SCOPE',
          language,
          userMessage: params.message,
          draft: buildOutOfScopeReply(language),
          facts: {
            redirect_topics:
              language === 'ar'
                ? ['شراء العقارات', 'بيع العقارات', 'التسعير', 'تحليل السوق']
                : ['buying', 'selling', 'pricing', 'market analysis'],
          },
          recentHistory: params.recentHistory,
        });
        this.logger.log('CHAT_MODE: OUT_OF_SCOPE');
        this.logger.log('OWNER_CHAT_MODE mode=OUT_OF_SCOPE');
        this.logger.log('OLLAMA_ORCHESTRATOR_INTENT intent=OUT_OF_SCOPE');
        this.logger.log('OLLAMA_ORCHESTRATOR_FINAL_RESPONSE route=out_of_scope');
        return {
          handled: true,
          responseIntent: 'FALLBACK',
          text,
          data: null,
          route: 'out_of_scope',
          responseSource: this.aiService ? 'formatter' : 'emergency_fallback',
        };
      }
    }
    const mergedSlots = this.mergeSlots({
      explicitProperty,
      state: params.state,
      reuseState:
        marketSummaryPriority ||
        marketSummaryFollowUp ||
        propertySearchIntent ||
        comparisonIntent ||
        marketGeneralIntent ||
        investmentAreaAdviceIntent
          ? false
          : clearContinuation || hasPendingSlot,
    });
    const searchSlots = propertySearchIntent
      ? this.buildSearchSlots({
          state: params.state,
          explicitProperty,
        })
      : mergedSlots;
    const intent = this.resolveIntent({
      message: params.message,
      explicitProperty,
      mergedSlots,
      defaultIntent: detectedIntent,
      marketSummaryFollowUp,
      investmentAreaAdviceIntent,
    });

    this.logger.log(`OLLAMA_ORCHESTRATOR_INTENT intent=${intent}`);
    this.logger.log(
      `OLLAMA_ORCHESTRATOR_SLOTS explicit=${JSON.stringify(
        explicitProperty,
      )} merged=${JSON.stringify(mergedSlots)} reuse_state=${clearContinuation}`,
    );

    if (comparisonIntent) {
      this.logger.log('OWNER_CHAT_MODE mode=AREA_COMPARISON');
      const text = await this.compose({
        mode: 'MARKET_ANALYSIS',
        language,
        userMessage: params.message,
        draft:
          language === 'ar'
            ? 'أستطيع المقارنة بين المنطقتين من حيث الأسعار العامة والطلب وفرص الاستثمار. إذا أردت مقارنة أدق، حدد هل تريدها من ناحية السعر أم الاستثمار أم النشاط السوقي.'
            : 'I can compare the two areas by general prices, demand, and investment appeal. If you want a sharper comparison, tell me whether you care most about pricing, investment, or market activity.',
        facts: {
          comparison_targets: extractComparisonTargets(params.message),
        },
        recentHistory: params.recentHistory,
      });
      return {
        handled: true,
        responseIntent: 'FALLBACK',
        text,
        data: {
          context_state: {
            ...this.cleanState(params.state),
            pending_slot: undefined,
          },
        },
        route: 'area_comparison_guidance',
        responseSource: this.aiService ? 'formatter' : 'emergency_fallback',
      };
    }

    if (marketGeneralIntent) {
      this.logger.log('OWNER_CHAT_MODE mode=GENERAL_MARKET_CHAT');
      const text = await this.compose({
        mode: 'MARKET_ANALYSIS',
        language,
        userMessage: params.message,
        draft:
          language === 'ar'
            ? 'أكيد. أقدر أعطيك نظرة عامة عن السوق العقاري، مثل اتجاهات الأسعار، المناطق النشطة، وفرص الاستثمار. وإذا أردت مدينة محددة مثل دمشق أذكرها لأعطيك ملخصاً أدق.'
            : 'I can give you a general market overview, such as price trends, active areas, and investment opportunities. If you want a city-specific summary, mention the city.',
        facts: {
          scope: 'general_market_chat',
        },
        recentHistory: params.recentHistory,
      });
      return {
        handled: true,
        responseIntent: 'FALLBACK',
        text,
        data: {
          context_state: {
            ...this.cleanState(params.state),
            pending_slot: undefined,
          },
        },
        route: 'general_market_chat',
        responseSource: this.aiService ? 'formatter' : 'emergency_fallback',
      };
    }

    if (investmentAreaAdviceIntent) {
      this.logger.log('OWNER_CHAT_MODE mode=INVESTMENT_ADVICE');
      if (!mergedSlots.city && !mergedSlots.district) {
        const text = await this.compose({
          mode: 'MARKET_ANALYSIS',
          language,
          userMessage: params.message,
          draft:
            language === 'ar'
              ? 'في أي مدينة أو منطقة تريد أفضل فرص الاستثمار حالياً؟ مثال: دمشق أو ريف دمشق.'
              : 'Which city or area do you want the best current investment opportunities for?',
          facts: {
            required_fields: ['city_or_district'],
          },
          recentHistory: params.recentHistory,
        });
        return {
          handled: true,
          responseIntent: 'FALLBACK',
          text,
          data: {
            context_state: {
              ...this.cleanState(params.state),
              pending_slot: undefined,
            },
          },
          route: 'investment_area_clarification',
          responseSource: this.aiService ? 'formatter' : 'emergency_fallback',
        };
      }
    }

    if (propertySearchIntent) {
      this.logger.log('CHAT_MODE: GENERAL_REAL_ESTATE_CHAT');
      this.logger.warn('OLLAMA_FALLBACK reason=misrouted_intent');
      this.logger.log('OWNER_CHAT_MODE mode=PROPERTY_SEARCH');
      const text = await this.compose({
        mode: 'PROPERTY_SEARCH',
        language,
        userMessage: params.message,
        draft: this.buildPropertySearchDraft({
          language,
          city: searchSlots.city,
          district: searchSlots.district,
          propertyType: searchSlots.property_type,
          listingIntent: params.state.listing_intent,
        }),
        facts: {
          intent: domain.intent,
          city: searchSlots.city,
          district: searchSlots.district,
          property_type: searchSlots.property_type,
          listing_intent: params.state.listing_intent,
        },
        recentHistory: params.recentHistory,
      });
      this.logger.log('OLLAMA_ORCHESTRATOR_FINAL_RESPONSE route=property_search_guidance');
      return {
        handled: true,
        responseIntent: 'FALLBACK',
        text,
        data: {
          context_state: {
            ...this.cleanState(params.state),
            ...searchSlots,
            pending_slot: undefined,
          },
          current_session_last_property: searchSlots,
        },
        route: 'property_search_guidance',
        responseSource: this.aiService ? 'formatter' : 'emergency_fallback',
      };
    }

    if (intent === 'MARKET_SUMMARY') {
      this.logger.log('CHAT_MODE: MARKET_SUMMARY');
      this.logger.log('CHAT_MODE: MARKET_SUMMARY_CONFIRMED');
      this.logger.log('OWNER_CHAT_MODE mode=MARKET_ANALYSIS');
      if (!mergedSlots.city) {
        this.logger.warn('OLLAMA_FALLBACK reason=missing_required_facts');
        const text = await this.compose({
          mode: 'MARKET_ANALYSIS',
          language,
          userMessage: params.message,
          draft: 'عن أي مدينة تريد ملخص السوق؟ مثال: دمشق',
          facts: {
            required_fields: ['city'],
          },
          recentHistory: params.recentHistory,
        });
        return {
          handled: true,
          responseIntent: 'FALLBACK',
          text,
          data: {
            required_fields: ['city'],
            context_state: {
              ...this.cleanState(params.state),
              pending_slot: 'city',
            },
            current_session_last_property: mergedSlots,
          },
          route: 'market_summary_missing_city',
          responseSource: this.aiService ? 'formatter' : 'emergency_fallback',
        };
      }
      const city = mergedSlots.city;
      this.logger.log('OLLAMA_ORCHESTRATOR_ENGINE_CALL engine=market_heatmap');
      this.logger.log('DETERMINISTIC_ENGINE_USED engine=market_heatmap');
      const heatmap = await this.marketStatsService.getHeatmap(city);
      const text = await this.compose({
        mode: 'MARKET_ANALYSIS',
        language,
        userMessage: params.message,
        draft: this.buildHeatmapDraft(heatmap.city, heatmap.districts),
        facts: {
          city: heatmap.city,
          districts: heatmap.districts.slice(0, 3).map((item) => ({
            district: item.district,
            avg_price_per_m2: item.avg_price_per_m2,
            median_price_per_m2: item.median_price_per_m2,
            market_status: item.market_status,
          })),
        },
        lockedValues: heatmap.districts
          .slice(0, 3)
          .flatMap((item) => [item.district, item.avg_price_per_m2, item.median_price_per_m2]),
        recentHistory: params.recentHistory,
      });
      this.logger.log('OLLAMA_ORCHESTRATOR_FINAL_RESPONSE route=market_summary');
      return {
        handled: true,
        responseIntent: 'FALLBACK',
        text,
          data: {
            market_heatmap: {
              city: heatmap.city,
              districts: heatmap.districts.slice(0, 3),
            },
            context_state: {
              ...this.cleanState(params.state),
              pending_slot: undefined,
            },
            current_session_last_property: mergedSlots,
          },
          route: 'market_summary',
          responseSource: this.aiService ? 'formatter' : 'emergency_fallback',
      };
    }

    if (intent === 'PROPERTY_EVALUATION' || intent === 'INVESTMENT_ANALYSIS') {
      this.logger.log('CHAT_MODE: REAL_ESTATE_ANALYSIS');
      this.logger.log(`OWNER_CHAT_MODE mode=${intent}`);
      if (!hasExplicitPropertyFacts && !clearContinuation) {
        this.logger.log('CHAT_MODE: PENDING_SLOT_ASSIST');
        this.logger.warn('OLLAMA_FALLBACK reason=missing_required_facts');
        const text = await this.compose({
          mode: 'FOLLOW_UP_CONTEXTUAL',
          language,
          userMessage: params.message,
          draft:
            'أرسل لي نوع العقار + المنطقة + المساحة + سعر العرض، مثال: شقة بالمزة 120 متر سعرها 135000',
          facts: {
            missing_fields: ['property_type', 'district_or_city', 'area_m2', 'ask_price'],
          },
          recentHistory: params.recentHistory,
        });
        this.logger.log(
          'OLLAMA_ORCHESTRATOR_FINAL_RESPONSE route=missing_fields_no_stale_state',
        );
        return {
          handled: true,
          responseIntent: 'FALLBACK',
          text,
          data: {
            required_fields: ['property_type', 'district_or_city', 'area_m2', 'ask_price'],
            context_state: {
              ...this.cleanState(params.state),
              pending_slot: 'property_type',
            },
            current_session_last_property: mergedSlots,
          },
          route: 'missing_fields_no_stale_state',
          responseSource: this.aiService ? 'formatter' : 'emergency_fallback',
        };
      }

      const missingFields = this.getRequiredFields(intent, mergedSlots);
      if (missingFields.length > 0) {
        this.logger.log('CHAT_MODE: PENDING_SLOT_ASSIST');
        this.logger.warn('OLLAMA_FALLBACK reason=missing_required_facts');
        const text = await this.compose({
          mode: 'FOLLOW_UP_CONTEXTUAL',
          language,
          userMessage: params.message,
          draft: this.buildMissingFieldDraft(missingFields),
          facts: {
            missing_fields: missingFields,
            known_fields: mergedSlots,
          },
          recentHistory: params.recentHistory,
        });
        this.logger.log(
          `OLLAMA_ORCHESTRATOR_FINAL_RESPONSE route=missing_fields missing=${missingFields.join(',')}`,
        );
        return {
          handled: true,
          responseIntent: 'FALLBACK',
          text,
          data: {
            required_fields: missingFields,
            context_state: {
              ...this.cleanState(params.state),
              ...mergedSlots,
              pending_slot: this.resolvePendingSlot(missingFields),
            },
            current_session_last_property: mergedSlots,
          },
          route: 'missing_fields',
          responseSource: this.aiService ? 'formatter' : 'emergency_fallback',
        };
      }

      if (pendingSlot) {
        this.logger.log(
          `OLLAMA_ORCHESTRATOR_PENDING_SLOT auto_trigger slot_completed=${pendingSlot}`,
        );
      }

      if (intent === 'PROPERTY_EVALUATION') {
        this.logger.log('CHAT_MODE: PROPERTY_EVALUATION');
        this.logger.log('OLLAMA_ORCHESTRATOR_ENGINE_CALL engine=advisor.evaluateMarketPrice');
        this.logger.log('DETERMINISTIC_ENGINE_USED engine=advisor.evaluateMarketPrice');
        const evaluation = await this.advisorService.evaluateMarketPrice({
          city: mergedSlots.city || 'damascus',
          district: mergedSlots.district,
          property_type: mergedSlots.property_type as string,
          area_m2: mergedSlots.area_m2 as number,
          bedrooms: mergedSlots.bedrooms,
          ask_price: mergedSlots.ask_price as number,
        });
        const text = await this.compose({
          mode: 'PRICE_ESTIMATION',
          language,
          userMessage: params.message,
          draft: `بعد تحليل السوق، السعر المتوقع لهذا العقار حوالي ${evaluation.estimated_price} دولار. السعر الحالي ${this.describeEvaluation(
            evaluation.evaluation,
          )}، لذلك التقييم هو ${evaluation.evaluation}. مستوى الثقة في التقييم ${this.describeConfidence(
            evaluation.confidence,
          )}، وفرق السعر التقريبي ${Math.abs(evaluation.difference_percent)}%.`,
          facts: { ...evaluation },
          lockedValues: [
            evaluation.estimated_price,
            evaluation.average_price_per_m2,
            evaluation.median_price_per_m2,
            evaluation.difference_percent,
            evaluation.confidence,
            evaluation.evaluation,
          ],
          recentHistory: params.recentHistory,
        });
        this.logger.log('CHAT_ROUTE: PENDING_SLOT_FORCE_CLEARED_AFTER_SUCCESS type=PROPERTY_EVALUATION');
        this.logger.log('OLLAMA_ORCHESTRATOR_FINAL_RESPONSE route=property_evaluation');
        return {
          handled: true,
          responseIntent: 'BUYER_EVALUATE',
          text,
          data: {
            context_state: {
              ...this.cleanState(params.state),
              ...mergedSlots,
              pending_slot: undefined,
            },
            market_evaluation: evaluation,
            current_session_last_property: mergedSlots,
          },
          route: 'property_evaluation',
          responseSource: this.aiService ? 'formatter' : 'emergency_fallback',
        };
      }

      this.logger.log('CHAT_MODE: INVESTMENT_ANALYSIS');
      this.logger.log('OLLAMA_ORCHESTRATOR_ENGINE_CALL engine=advisor.investmentAnalysis');
      this.logger.log('DETERMINISTIC_ENGINE_USED engine=advisor.investmentAnalysis');
      const investment = await this.advisorService.investmentAnalysis({
        city: mergedSlots.city || 'damascus',
        district: (mergedSlots.district || mergedSlots.city) as string,
        property_type: mergedSlots.property_type as string,
        area_m2: mergedSlots.area_m2 as number,
        bedrooms: mergedSlots.bedrooms,
        ask_price: mergedSlots.ask_price as number,
      });
      const text = await this.compose({
        mode: 'INVESTMENT_ADVICE',
        language,
        userMessage: params.message,
        draft: `من ناحية الاستثمار، العقار يبدو ${this.describeInvestmentScore(
          investment.investment_score,
        )}. تقييم الاستثمار ${investment.investment_score} من 10، وحالة السوق في المنطقة ${this.describeMarketStatus(
          investment.market_status,
        )}. السعر التقديري السوقي حوالي ${investment.estimated_price} دولار، ووضع التسعير الحالي هو ${investment.evaluation}. ${investment.advice}`,
        facts: { ...investment },
        lockedValues: [
          investment.estimated_price,
          investment.difference_percent,
          investment.investment_score,
          investment.market_status,
          investment.evaluation,
          investment.confidence,
        ],
        recentHistory: params.recentHistory,
      });
      this.logger.log('CHAT_ROUTE: INVESTMENT_RESPONSE');
      this.logger.log('CHAT_ROUTE: PENDING_SLOT_FORCE_CLEARED_AFTER_SUCCESS type=INVESTMENT_ANALYSIS');
      this.logger.log('OLLAMA_ORCHESTRATOR_FINAL_RESPONSE route=investment_analysis');
      return {
        handled: true,
        responseIntent: 'BUYER_EVALUATE',
        text,
        data: {
          context_state: {
            ...this.cleanState(params.state),
            ...mergedSlots,
            pending_slot: undefined,
          },
          investment_analysis: investment,
          current_session_last_property: mergedSlots,
          },
          route: 'investment_analysis',
          responseSource: this.aiService ? 'formatter' : 'emergency_fallback',
        };
    }

    const generalText = await this.composeGeneralRealEstateReply({
      language,
      userMessage: params.message,
      lastProperty: mergedSlots,
      recentHistory: params.recentHistory,
    });
    this.logger.log('CHAT_MODE: GENERAL_REAL_ESTATE_CHAT');
    this.logger.log('OWNER_CHAT_MODE mode=GENERAL_REAL_ESTATE_CHAT');
    this.logger.log('OLLAMA_ORCHESTRATOR_FINAL_RESPONSE route=general_real_estate_chat');
    return {
      handled: true,
      responseIntent: 'FALLBACK',
      text: generalText,
      data: {
        context_state: {
          ...this.cleanState(params.state),
          pending_slot: undefined,
        },
        current_session_last_property: mergedSlots,
      },
      route: 'general_real_estate_chat',
      responseSource: this.aiService ? 'formatter' : 'emergency_fallback',
    };
  }

  private resolveIntent(params: {
    message: string;
    explicitProperty: ExtractedPropertyData;
    mergedSlots: ExtractedPropertyData;
    marketSummaryFollowUp?: boolean;
    investmentAreaAdviceIntent?: boolean;
    defaultIntent:
      | 'PROPERTY_EVALUATION'
      | 'INVESTMENT_ANALYSIS'
      | 'MARKET_HEATMAP'
      | 'PROPERTY_SEARCH'
      | 'GENERAL_QUESTION';
  }): OrchestratorIntent {
    if (this.isGeneralChatMessage(params.message)) {
      return 'GENERAL_CHAT';
    }
    if (params.marketSummaryFollowUp || this.isMarketSummaryMessage(params.message)) {
      return 'MARKET_SUMMARY';
    }
    if (this.looksLikePropertySearchMessage(params.message)) {
      return 'PROPERTY_SEARCH';
    }
    if (params.defaultIntent === 'PROPERTY_SEARCH') {
      return 'PROPERTY_SEARCH';
    }
    if (params.defaultIntent === 'PROPERTY_EVALUATION') {
      return 'PROPERTY_EVALUATION';
    }
    if (params.defaultIntent === 'INVESTMENT_ANALYSIS') {
      return 'INVESTMENT_ANALYSIS';
    }
    if (params.defaultIntent === 'MARKET_HEATMAP') {
      return 'MARKET_SUMMARY';
    }
    if (params.investmentAreaAdviceIntent) {
      return 'MARKET_SUMMARY';
    }

    if (this.shouldAutoEnterPropertyEvaluation(params.message, params.explicitProperty, params.mergedSlots)) {
      return 'PROPERTY_EVALUATION';
    }

    return 'GENERAL_REAL_ESTATE_CHAT';
  }

  private mergeSlots(params: {
    explicitProperty: ExtractedPropertyData;
    state: OwnerChatStateSnapshot;
    reuseState: boolean;
  }): ExtractedPropertyData {
    const base = params.reuseState
      ? {
          city: params.state.city,
          district: params.state.district,
          property_type: params.state.property_type,
          area_m2: params.state.area_m2,
          bedrooms: params.state.bedrooms,
          ask_price: params.state.ask_price ?? params.state.budget_syp,
        }
      : {};

    return this.cleanSlots({
      ...base,
      ...params.explicitProperty,
    });
  }

  private buildSearchSlots(params: {
    state: OwnerChatStateSnapshot;
    explicitProperty: ExtractedPropertyData;
  }): ExtractedPropertyData {
    const hasFreshLocation = Boolean(params.explicitProperty.city || params.explicitProperty.district);

    return this.cleanSlots({
      city:
        params.explicitProperty.city ||
        (!hasFreshLocation ? params.state.city : undefined),
      district:
        params.explicitProperty.district ||
        (!hasFreshLocation ? params.state.district : undefined),
      property_type:
        params.explicitProperty.property_type || params.state.property_type,
      area_m2: params.explicitProperty.area_m2 || params.state.area_m2,
      bedrooms: params.explicitProperty.bedrooms || params.state.bedrooms,
      ask_price: params.explicitProperty.ask_price || params.state.ask_price,
    });
  }

  private cleanSlots(value: ExtractedPropertyData): ExtractedPropertyData {
    return {
      ...(value.city ? { city: String(value.city).trim() } : {}),
      ...(value.district ? { district: String(value.district).trim() } : {}),
      ...(value.property_type ? { property_type: String(value.property_type).trim() } : {}),
      ...(this.toPositiveNumber(value.area_m2) != null
        ? { area_m2: this.toPositiveNumber(value.area_m2) }
        : {}),
      ...(this.toPositiveNumber(value.bedrooms) != null
        ? { bedrooms: this.toPositiveNumber(value.bedrooms) }
        : {}),
      ...(this.toPositiveNumber(value.ask_price) != null
        ? { ask_price: this.toPositiveNumber(value.ask_price) }
        : {}),
    };
  }

  private cleanState(value: OwnerChatStateSnapshot): OwnerChatStateSnapshot {
    return {
      ...(value.listing_intent ? { listing_intent: value.listing_intent } : {}),
      ...(value.city ? { city: value.city } : {}),
      ...(value.district ? { district: value.district } : {}),
      ...(value.property_type ? { property_type: value.property_type } : {}),
      ...(this.toPositiveNumber(value.area_m2) != null
        ? { area_m2: this.toPositiveNumber(value.area_m2) }
        : {}),
      ...(this.toPositiveNumber(value.bedrooms) != null
        ? { bedrooms: this.toPositiveNumber(value.bedrooms) }
        : {}),
      ...(this.toPositiveNumber(value.ask_price ?? value.budget_syp) != null
        ? { ask_price: this.toPositiveNumber(value.ask_price ?? value.budget_syp) }
        : {}),
      ...(value.pending_slot ? { pending_slot: value.pending_slot } : {}),
    };
  }

  private hasExplicitPropertyFacts(value: ExtractedPropertyData): boolean {
    return Boolean(
      value.city ||
        value.district ||
        value.property_type ||
        value.area_m2 ||
        value.ask_price ||
        value.bedrooms,
    );
  }

  private looksLikePropertyThread(message: string, mergedSlots: ExtractedPropertyData): boolean {
    const normalized = this.normalizeText(message);
    return Boolean(
      mergedSlots.district ||
        mergedSlots.city ||
        /(عقار|شقة|فيلا|منزل|بيت|سعره|سعرها|كم سعر|تقييم|قيم|صفقة|استثمار)/.test(
          normalized,
        ),
    );
  }

  private isClearPropertyContinuation(
    message: string,
    lastAssistantText?: string | null,
  ): boolean {
    const normalized = this.normalizeText(message);
    const shortFollowUp =
      /^(طيب|تمام|اوكي|أوكي|نعم|اي|yes|ok|okay|كم سعره|كم سعرها|سعره|سعرها|هل هي صفقة|هل هاد صفقة|للشراء|للبيع|للايجار|للإيجار|شقة|فيلا|منزل|\d+\s*متر|\d[\d.,]*)$/.test(
        normalized,
      ) || /^(في|ب)\s+\S+/.test(normalized);

    return shortFollowUp && /[؟?]\s*$/.test(String(lastAssistantText || '').trim());
  }

  private getRequiredFields(
    intent: 'PROPERTY_EVALUATION' | 'INVESTMENT_ANALYSIS',
    slots: ExtractedPropertyData,
  ): string[] {
    const missing: string[] = [];
    if (!slots.district && !slots.city) {
      missing.push('district_or_city');
    }
    if (!slots.property_type) {
      missing.push('property_type');
    }
    if (!this.toPositiveNumber(slots.area_m2)) {
      missing.push('area_m2');
    }
    if (!this.toPositiveNumber(slots.ask_price)) {
      missing.push('ask_price');
    }
    return missing;
  }

  private resolvePendingSlot(
    missingFields: string[],
  ): OwnerChatStateSnapshot['pending_slot'] | undefined {
    if (missingFields.includes('property_type')) return 'property_type';
    if (missingFields.includes('district')) return 'district';
    if (missingFields.includes('district_or_city')) return 'district';
    if (missingFields.includes('area_m2')) return 'area_m2';
    if (missingFields.includes('ask_price')) return 'ask_price';
    return undefined;
  }

  private buildMissingFieldDraft(missingFields: string[]): string {
    const missing = new Set(missingFields);
    if (missing.has('property_type') && missing.size === 1) {
      return 'ما نوع العقار؟ مثال: شقة أو فيلا أو منزل.';
    }
    if (missing.has('district_or_city') && missing.size === 1) {
      return 'ما هي المنطقة أو المدينة؟ مثال: المزة أو دمشق.';
    }
    if (missing.has('area_m2') && missing.size === 1) {
      return 'كم مساحة العقار بالمتر؟ مثال: 150 متر.';
    }
    if (missing.has('ask_price') && missing.size === 1) {
      return 'ممتاز، بقي فقط سعر العرض الحالي.';
    }

    const labels = [
      missing.has('property_type') ? 'نوع العقار' : null,
      missing.has('district_or_city') ? 'المنطقة أو المدينة' : null,
      missing.has('area_m2') ? 'المساحة' : null,
      missing.has('ask_price') ? 'سعر العرض' : null,
    ].filter(Boolean);

    return `تمام. بقي ${labels.join(' + ')} حتى أقدر أحلل العقار بدقة.`;
  }

  private buildHeatmapDraft(
    city: string,
    districts: Array<{ district: string; market_status: string }>,
  ): string {
    const top = districts.slice(0, 3);
    const lines = top.map(
      (item, index) => `${index + 1}. ${item.district} — ${this.describeMarketStatus(item.market_status)}`,
    );
    return [`أفضل المناطق حالياً في ${city}:`, ...lines].join('\n');
  }

  private async composeGeneralChatReply(params: {
    language: RealEstateLanguage;
    userMessage: string;
    recentHistory?: AiConversationTurn[];
  }): Promise<string> {
    const fallback = this.buildGeneralChatFallback(params.language, params.userMessage);

    if (!this.aiService) {
      this.logger.warn('OLLAMA_ORCHESTRATOR_FALLBACK route=general_chat reason=no_ai_service');
      return fallback;
    }

    try {
      const reply = await this.aiService.chat(
        this.aiService.buildConversationMessages({
          systemPrompt: buildOllamaSystemPrompt('GENERAL_CHAT'),
          userMessage: params.userMessage,
          recentHistory: params.recentHistory,
        }),
      );

      const finalText = String(reply || '').trim() || fallback;
      if (!String(reply || '').trim()) {
        this.logger.warn('OLLAMA_ORCHESTRATOR_FALLBACK route=general_chat reason=empty_reply');
      }
      return finalText;
    } catch (error) {
      this.logger.warn(
        `OLLAMA_ORCHESTRATOR_FALLBACK route=general_chat reason=exception message=${(error as Error)?.message || error}`,
      );
      return fallback;
    }
  }

  private async composeAcknowledgementReply(params: {
    language: RealEstateLanguage;
    userMessage: string;
    recentHistory?: AiConversationTurn[];
  }): Promise<string> {
    const fallback =
      params.language === 'ar'
        ? this.pickVariant([
            'على الرحب والسعة 🌷 إذا بدك تحليل عقار آخر أو سؤال عن السوق أنا حاضر.',
            'تحت أمرك دائماً. إذا عندك أي استفسار عقاري خبرني.',
            'يسعدني ذلك. إذا حاب نكمل بعقار آخر أو بسؤال عن السوق أنا جاهز.',
          ])
        : 'You are welcome. If you want another property analysis, I am ready.';

    if (!this.aiService) {
      this.logger.warn('OLLAMA_ORCHESTRATOR_FALLBACK route=acknowledgement reason=no_ai_service');
      return fallback;
    }

    try {
      const reply = await this.aiService.chat(
        this.aiService.buildConversationMessages({
          systemPrompt: buildOllamaSystemPrompt('GENERAL_CHAT'),
          userMessage: `Reply briefly and warmly to this thank-you or acknowledgement: ${params.userMessage}`,
          recentHistory: params.recentHistory,
        }),
      );

      const finalText = String(reply || '').trim() || fallback;
      if (!String(reply || '').trim()) {
        this.logger.warn('OLLAMA_ORCHESTRATOR_FALLBACK route=acknowledgement reason=empty_reply');
      }
      return finalText;
    } catch (error) {
      this.logger.warn(
        `OLLAMA_ORCHESTRATOR_FALLBACK route=acknowledgement reason=exception message=${(error as Error)?.message || error}`,
      );
      return fallback;
    }
  }

  private async composeShortFollowUpReply(params: {
    language: RealEstateLanguage;
    userMessage: string;
    recentHistory?: AiConversationTurn[];
  }): Promise<string> {
    const fallback =
      params.language === 'ar'
        ? this.pickVariant([
            'تمام، إذا حاب نكمل أو نحلل عقار آخر أنا حاضر.',
            'أكيد، خذ راحتك. وإذا عندك سؤال عقاري آخر أنا جاهز.',
            'ولا يهمك، إذا بدك نكمل من أي نقطة أنا معك.',
          ])
        : 'Sure. If you want to continue with another property question, I am ready.';

    if (!this.aiService) {
      this.logger.warn('OLLAMA_ORCHESTRATOR_FALLBACK route=short_follow_up reason=no_ai_service');
      return fallback;
    }

    try {
      const reply = await this.aiService.chat(
        this.aiService.buildConversationMessages({
          systemPrompt: buildOllamaSystemPrompt('GENERAL_CHAT'),
          userMessage: `Reply briefly and naturally to this short social follow-up: ${params.userMessage}`,
          recentHistory: params.recentHistory,
        }),
      );

      const finalText = String(reply || '').trim() || fallback;
      if (!String(reply || '').trim()) {
        this.logger.warn('OLLAMA_ORCHESTRATOR_FALLBACK route=short_follow_up reason=empty_reply');
      }
      return finalText;
    } catch (error) {
      this.logger.warn(
        `OLLAMA_ORCHESTRATOR_FALLBACK route=short_follow_up reason=exception message=${(error as Error)?.message || error}`,
      );
      return fallback;
    }
  }

  private async composeGeneralRealEstateReply(params: {
    language: RealEstateLanguage;
    userMessage: string;
    lastProperty: ExtractedPropertyData;
    recentHistory?: AiConversationTurn[];
  }): Promise<string> {
    const fallback =
      params.language === 'ar'
        ? 'أستطيع مساعدتك في تقييم العقارات، تحليل السوق، مقارنة المناطق، وفهم سعر المتر. إذا أردت تحليلاً لعقار معين أرسل المنطقة ونوع العقار والمساحة وسعر العرض.'
        : 'I can help with valuation, market analysis, district comparison, and explaining real-estate concepts. If you want a property analysis, send the district, property type, area, and asking price.';

    if (!this.aiService) {
      this.logger.warn('OLLAMA_ORCHESTRATOR_FALLBACK route=general_real_estate reason=no_ai_service');
      return fallback;
    }

    try {
      const reply = await this.aiService.chat(
        this.aiService.buildConversationMessages({
          systemPrompt: buildOllamaSystemPrompt('REAL_ESTATE_DOMAIN'),
          userMessage: [
            `User message: ${params.userMessage}`,
            `Known property state: ${JSON.stringify(params.lastProperty)}`,
            'Reply with only the final answer text.',
          ].join('\n'),
          recentHistory: params.recentHistory,
        }),
      );

      const finalText = String(reply || '').trim() || fallback;
      if (!String(reply || '').trim()) {
        this.logger.warn('OLLAMA_ORCHESTRATOR_FALLBACK route=general_real_estate reason=empty_reply');
      }
      return finalText;
    } catch (error) {
      this.logger.warn(
        `OLLAMA_ORCHESTRATOR_FALLBACK route=general_real_estate reason=exception message=${(error as Error)?.message || error}`,
      );
      return fallback;
    }
  }

  private isPoliteSmallTalk(message: string): boolean {
    const normalized = this.normalizeText(message);
    return /^(مساء الخير|صباح الخير|مرحبا|هلا|اهلا|أهلا|الو|كيفك|كيف الحال|شو الاخبار|شو الأخبار|شو اخبارك|شلونك|منيح|تمام|طيب|شكرا|شكرا لك|شكراً|يسعد مسا|thanks|thank you)$/.test(
      normalized,
    );
  }

  private isGeneralChatMessage(message: string): boolean {
    const normalized = this.normalizeText(message);
    const hasSocialSignal =
      /(مساء الخير|صباح الخير|مرحبا|هلا|اهلا|أهلا|الو|كيفك|كيف حالك|كيف الحال|شو الاخبار|شو الأخبار|شو اخبارك|شو جديد|كيف يومك|احكي معي|شلونك|السلام عليكم|منيح|تمام|طيب|شكرا|شكرا لك|شكراً|يسعد مسا|هاي|hello|hi|hey|good morning|good evening|how are you)/.test(
        normalized,
      );
    const hasRealEstateSignal =
      /(سعر|تقييم|استثمار|عقار|شقة|فيلا|منزل|بيت|سوق|منطقة|حي|buy|sell|price|market|investment|property)/.test(
        normalized,
      );
    return hasSocialSignal && !hasRealEstateSignal;
  }

  private isAcknowledgementMessage(message: string): boolean {
    const normalized = this.normalizeText(message);
    return /^(شكرا|شكرا لك|شكراً|شكراً لك|يسلمو|ميرسي|thanks|thank you)$/.test(normalized);
  }

  private isClosureSmallTalkMessage(message: string): boolean {
    const normalized = this.normalizeText(message);
    return /^(طيب|تمام|اوكي|أوكي|ماشي|ممتاز|حسنا|ok|okay|sure)$/.test(normalized);
  }

  private isFollowUpAfterResultMessage(message: string): boolean {
    const normalized = this.normalizeText(message);
    return /(طيب شو الافضل|طيب شو الأفضل|شو الافضل|شو الأفضل|ليش هيك|قارنلي بينهم|قارن بينهم|والأفضل|طيب|تمام)/.test(
      normalized,
    );
  }

  private isPropertySearchIntent(domainIntent: string, message: string): boolean {
    if (domainIntent === 'PROPERTY_SEARCH' || domainIntent === 'PROPERTY_RECOMMENDATION') {
      return true;
    }

    return this.looksLikePropertySearchMessage(message);
  }

  private looksLikePropertySearchMessage(message: string): boolean {
    const normalized = this.normalizeText(message);
    return /(اعطيني العقارات|اعرض العقارات|اعرضلي عقارات|العقارات اللي|عقارات بدمشق|عقارات في دمشق|شو في عقارات|في عقارات|بدور على|ابحث عن|أبحث عن|ابحثلي عن|دورلي على|looking for|show me properties|properties in|find properties|list properties)/.test(
      normalized,
    );
  }

  private isPropertySearchContinuation(
    message: string,
    state: OwnerChatStateSnapshot,
  ): boolean {
    const normalized = this.normalizeText(message);
    const hasActiveSearchContext = Boolean(
      state.listing_intent === 'BUY' ||
        state.listing_intent === 'RENT' ||
        state.city ||
        state.district ||
        state.property_type,
    );
    const hasSearchSignal = /(شراء|للشراء|إيجار|ايجار|للإيجار|للايجار|شقة|شقق|بيت|منزل|فيلا|أرض|ارض|ميزانية|مساحة|متر|بدور على|ابحث عن)/.test(
      normalized,
    );
    return hasActiveSearchContext && hasSearchSignal;
  }

  private isComparisonMessage(message: string): boolean {
    const normalized = this.normalizeText(message);
    return /(شو الفرق بين|ما الفرق بين|قارن بين|قارنلي بينهم|قارنهم|أيهم أفضل|ايهم افضل|between|compare|vs)/.test(
      normalized,
    );
  }

  private isGeneralMarketChatMessage(message: string): boolean {
    const normalized = this.normalizeText(message);
    return /(اخبار عامة عن العقارات|أخبار عامة عن العقارات|اخبار العقارات|أخبار العقارات|اخبار السوق العقاري|أخبار السوق العقاري|حدثني عن العقارات|حدثني اخبار عامة)/.test(
      normalized,
    );
  }

  private isMarketSummaryFollowUp(
    message: string,
    lastAssistantText: string | null | undefined,
    explicitProperty: ExtractedPropertyData,
  ): boolean {
    const normalized = this.normalizeText(message);
    return (
      /ملخص السوق|عن اي مدينة|عن أي مدينة|السوق/.test(String(lastAssistantText || '')) &&
      Boolean(
        explicitProperty.city ||
          explicitProperty.district ||
          /دمشق|ريف دمشق|حلب|حمص/.test(normalized),
      )
    );
  }

  private isInvestmentAreaAdviceMessage(
    message: string,
    explicitProperty: ExtractedPropertyData,
  ): boolean {
    const normalized = this.normalizeText(message);
    return (
      /(وين الاستثمار افضل|وين الاستثمار أفضل|أفضل استثمار|افضل استثمار|أفضل منطقة للاستثمار|افضل منطقة للاستثمار)/.test(
        normalized,
      ) && !this.hasExplicitPropertyFacts(explicitProperty)
    );
  }

  private isMarketSummaryMessage(message: string): boolean {
    const normalized = this.normalizeText(message);
    const hasMarketSignal =
      /(احوال الاسعار|أحوال الأسعار|اسعار العقارات|أسعار العقارات|سوق دمشق اليوم|كيف السوق|شو وضع السوق|خطة السوق|ملخص السوق|احكيلي عن سوق|السوق اليوم|اغلى الاحياء|أغلى الأحياء|افضل مناطق|أفضل مناطق|undervalued|hot areas|market summary)/.test(
        normalized,
      );
    const hasLocationSignal = /(دمشق|الشام|حلب|حمص|مدينة|منطقة|حي)/.test(normalized);
    const hasSpecificPropertyDetails = Boolean(
      this.toPositiveNumber((message.match(/(\d+(?:\.\d+)?)\s*(?:متر|m2|sqm)/i) || [])[1]) ||
        /(شقة|فيلا|منزل|بيت|ارض|أرض|apartment|villa|house|land)/.test(normalized),
    );

    return hasMarketSignal && (hasLocationSignal || /السوق اليوم/.test(normalized)) && !hasSpecificPropertyDetails;
  }

  private shouldAutoEnterPropertyEvaluation(
    message: string,
    explicitProperty: ExtractedPropertyData,
    mergedSlots: ExtractedPropertyData,
  ): boolean {
    const normalized = this.normalizeText(message);
    const hasValuationSignal =
      /(هل السعر مناسب|هل العقار غالي|قيم هذا العقار|قي[ّم|م] هذا العقار|سعرها مناسب|كم سعره|كم سعرها|قيم العقار|بدي تقييم عقار|بدي تقييم للعقار|اريد تقييم عقار|أريد تقييم عقار|overpriced|fair price|evaluate this property|property evaluation|سعره|سعرها|كم سعر|تقييم|قيم|سعر العرض)/i.test(
        normalized,
      );
    const hasCompleteExplicitBundle = Boolean(
      (explicitProperty.city || explicitProperty.district) &&
        explicitProperty.property_type &&
        explicitProperty.area_m2 &&
        explicitProperty.ask_price,
    );
    const hasCompleteMergedBundle = Boolean(
      (mergedSlots.city || mergedSlots.district) &&
        mergedSlots.property_type &&
        this.toPositiveNumber(mergedSlots.area_m2) &&
        this.toPositiveNumber(mergedSlots.ask_price),
    );

    return Boolean(
        hasCompleteExplicitBundle ||
        hasValuationSignal ||
        (this.hasExplicitPropertyFacts(explicitProperty) &&
          this.looksLikePropertyThread(message, mergedSlots) &&
          hasCompleteMergedBundle),
    );
  }

  private buildPropertySearchDraft(params: {
    language: RealEstateLanguage;
    city?: string;
    district?: string;
    propertyType?: string;
    listingIntent?: OwnerChatStateSnapshot['listing_intent'];
  }): string {
    if (params.language !== 'ar') {
      return 'Tell me whether you want to buy or rent, plus the property type, area, and budget so I can narrow the search properly.';
    }

    const location = params.district || params.city;
    const missing: string[] = [];
    if (!location) missing.push('المنطقة');
    if (!params.listingIntent) missing.push('هل تريد شراء أم إيجار');
    if (!params.propertyType) missing.push('نوع العقار');
    missing.push('الميزانية أو المساحة المطلوبة');

    if (location) {
      const remaining = missing.filter((item) => item !== 'المنطقة');
      return `أكيد. لديك ${location} بالفعل. بقي فقط ${remaining.join(
        ' + ',
      )} حتى أحدد لك الخيارات الأنسب.`;
    }

    return `أكيد. أرسل لي ${missing.join(' + ')} حتى أساعدك في البحث بشكل أدق.`;
  }

  private buildGeneralChatFallback(
    language: RealEstateLanguage,
    userMessage: string,
  ): string {
    const normalized = this.normalizeText(userMessage);
    if (language !== 'ar') {
      return this.pickVariant([
        'Hello. I am doing well, how can I help you today?',
        'Hi there. I am here and ready to help.',
        'Hello. Tell me how I can help you today.',
      ]);
    }

    if (/مساء الخير|يسعد مسا/.test(normalized)) {
      return this.pickVariant([
        'مساء النور 🌙 الحمد لله تمام، كيف أقدر أساعدك اليوم؟',
        'مساء الخير، أهلاً وسهلاً. خبرني كيف فيني أخدمك.',
        'يا مية هلا، مساءك جميل. كيف أساعدك اليوم؟',
      ]);
    }
    if (/صباح الخير/.test(normalized)) {
      return this.pickVariant([
        'صباح النور ☀️ الحمد لله تمام، كيف أقدر أساعدك؟',
        'صباح الخير، أهلاً وسهلاً. شو بتحب نبدأ فيه؟',
      ]);
    }
    if (/مرحبا|هلا|اهلا|أهلا|الو/.test(normalized)) {
      return this.pickVariant([
        'أهلاً وسهلاً 😄 خبرني كيف فيني أساعدك.',
        'يا هلا، أنا حاضر. شو بتحب نبدأ فيه؟',
        'مرحباً، تمام الحمد لله. كيف أقدر أخدمك؟',
      ]);
    }
    return this.pickVariant([
      'الحمد لله تمام 😄 كيف أقدر أساعدك اليوم؟',
      'تمام الحمد لله، خبرني كيف فيني أخدمك.',
      'أنا بخير، وأنت؟ إذا عندك سؤال أنا حاضر.',
    ]);
  }

  private pickVariant(options: string[]): string {
    return options[Math.floor(Math.random() * options.length)] || options[0] || '';
  }

  private isClearlyOffTopic(message: string): boolean {
    const normalized = this.normalizeText(message);
    return /(طبخ|وصفة|طقس|كرة|مباراة|برمجة|كود|سياسة|فيلم|اغنية|نكتة|recipe|weather|football|code|programming|movie|song|joke)/.test(
      normalized,
    );
  }

  private matchesPendingSlot(
    slot: NonNullable<OwnerChatStateSnapshot['pending_slot']>,
    extracted: ExtractedPropertyData,
  ): boolean {
    if (slot === 'ask_price') return this.toPositiveNumber(extracted.ask_price) != null;
    if (slot === 'area_m2') return this.toPositiveNumber(extracted.area_m2) != null;
    if (slot === 'property_type') return Boolean(extracted.property_type);
    if (slot === 'district') return Boolean(extracted.district);
    if (slot === 'city') return Boolean(extracted.city);
    return false;
  }

  private async compose(params: {
    mode:
      | 'OUT_OF_SCOPE'
      | 'PROPERTY_SEARCH'
      | 'FOLLOW_UP_CONTEXTUAL'
      | 'PRICE_ESTIMATION'
      | 'INVESTMENT_ADVICE'
      | 'MARKET_ANALYSIS';
    language: RealEstateLanguage;
    userMessage: string;
    draft: string;
    facts: Record<string, unknown>;
    lockedValues?: Array<string | number>;
    recentHistory?: AiConversationTurn[];
  }): Promise<string> {
    if (!this.aiService) {
      this.logger.warn('OLLAMA_FALLBACK reason=no_ai_service');
      return params.draft;
    }

    return this.aiService.composeRealEstateAnswer({
      mode: params.mode,
      language: params.language,
      userMessage: params.userMessage,
      draft: params.draft,
      facts: params.facts,
      lockedValues: params.lockedValues,
      recentHistory: params.recentHistory,
    });
  }

  private describeEvaluation(
    evaluation: 'underpriced' | 'fair_price' | 'overpriced',
  ): string {
    if (evaluation === 'underpriced') return 'أقل من السوق';
    if (evaluation === 'overpriced') return 'أعلى من السوق';
    return 'قريب من السوق';
  }

  private describeConfidence(
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW',
  ): string {
    if (confidence === 'HIGH') return 'عالي';
    if (confidence === 'MEDIUM') return 'متوسط';
    if (confidence === 'LOW') return 'منخفض';
    return 'منخفض جداً';
  }

  private describeInvestmentScore(score: number): string {
    if (score >= 8) return 'استثمار جيد';
    if (score >= 6) return 'استثمار متوسط';
    return 'استثمار ضعيف نسبياً';
  }

  private describeMarketStatus(status: string): string {
    if (status === 'HOT') return 'سوق ساخن وطلب مرتفع';
    if (status === 'UNDERVALUED') return 'منطقة undervalued وقد ترتفع لاحقًا';
    return 'سوق مستقر';
  }

  private detectLanguage(message: string): RealEstateLanguage {
    return /[\u0600-\u06FF]/.test(message) ? 'ar' : 'en';
  }

  private normalizeText(value: string): string {
    return String(value || '')
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private toPositiveNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return undefined;
    }
    return parsed;
  }
}
