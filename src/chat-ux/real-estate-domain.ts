export type RealEstateDomain = 'IN_SCOPE_REAL_ESTATE' | 'OUT_OF_SCOPE';
export type RealEstateLanguage = 'ar' | 'en';

export type RealEstateAssistantIntent =
  | 'SMALL_TALK_ALLOWED'
  | 'ACKNOWLEDGEMENT'
  | 'CONFIRMATION_YES'
  | 'CONFIRMATION_NO'
  | 'PROPERTY_SEARCH'
  | 'PROPERTY_RECOMMENDATION'
  | 'PRICE_ESTIMATION'
  | 'MARKET_ANALYSIS'
  | 'AREA_COMPARISON'
  | 'INVESTMENT_ADVICE'
  | 'RENTAL_GUIDANCE'
  | 'BUYER_GUIDANCE'
  | 'SELLER_GUIDANCE'
  | 'OWNER_SUPPORT'
  | 'PROPERTY_DETAILS'
  | 'REAL_ESTATE_FAQ'
  | 'GREETING_REAL_ESTATE'
  | 'FOLLOW_UP_CONTEXTUAL'
  | 'UNKNOWN_REAL_ESTATE';

export type RealEstateClassification = {
  domain: RealEstateDomain;
  intent: RealEstateAssistantIntent;
  language: RealEstateLanguage;
  normalizedMessage: string;
  needsClarification?: boolean;
  clarificationQuestion?: string;
};

export type RealEstateIntentRecovery = {
  inScope: boolean;
  intent: RealEstateAssistantIntent;
  needsClarification?: boolean;
  clarificationQuestion?: string;
};

const REAL_ESTATE_PATTERNS = [
  /\b(real estate|property|properties|apartment|apartments|villa|villas|house|houses|home|homes|office space|office|shop|storefront|land|plot|compound|district|neighborhood|price per meter|valuation|tenant|landlord|mortgage|roi|yield|lease|rent|rental|building|broker|listing)\b/i,
  /(عقار|عقارات|شقة|شقق|فيلا|فلل|بيت|منزل|مكتب|محل|أرض|ارض|إيجار|ايجار|استئجار|استثمار عقاري|عائد|حي|منطقة|سعر المتر|متر مربع|تشطيب|مالك|مستأجر|سمسار|وسيط عقاري|سكني|تجاري)/i,
  /(شراء\s+(عقار|شقة|شقق|بيت|منزل|فيلا|ارض|أرض|مكتب|محل)|بيع\s+(عقار|شقة|شقق|بيت|منزل|فيلا|ارض|أرض|مكتب|محل)|سعر\s+(العقار|الشقة|الشقق|البيت|المنزل|الفيلا|الأرض|الارض)|تقييم\s+(عقار|شقة|بيت|منزل|فيلا|أرض|ارض|محل|مكتب))/i,
  /\b(buy|sell|price|cost|valuation|estimate)\s+(property|apartment|villa|house|home|office|shop|storefront|land|plot|building)\b/i,
];

const OFF_TOPIC_PATTERNS = [
  /\b(airplane|airplanes|plane|planes|flight|flights|football|soccer|match|medicine|doctor|cooking|recipe|pasta|math|calculus|derivative|integral|poem|song|movie|game|capital of france|joke|code|programming|python|javascript)\b/i,
  /(طيارة|طيارات|طائرة|طائرات|رحلة|رحلات|مباراة|كرة|طب|دكتور|رياضيات|مشتقة|تكامل|وصفة|طبخ|أغنية|اغنية|فيلم|لعبة|نكتة|قصيدة|برمجة|كود|عاصمة فرنسا)/i,
];

const GREETING_PATTERNS = [
  /\b(hi|hello|hey|good morning|good evening|good afternoon|good night|how are you|how's it going|how are things)\b/i,
  /(مرحبا|أهلا|اهلا|هلا|السلام عليكم|كيفك|كيف الحال|شلونك|شو الأخبار|شو الاخبار|مساء الخير|صباح الخير)/i,
];

const ACKNOWLEDGEMENT_PATTERNS = [
  /\b(thanks|thank you|thank u|merci)\b/i,
  /(شكراً|شكرا|شكراً لك|شكرا لك|يسلمو|ميرسي)/i,
];

const CONFIRMATION_YES_PATTERNS = [
  /\b(yes|yeah|yep|ok|okay|sure|go ahead|sounds good)\b/i,
  /(نعم|اي|أيوه|ايوه|تمام|طيب|أوكي|اوكي|موافق|ماشي)/i,
];

const CONFIRMATION_NO_PATTERNS = [
  /\b(no|not now|nope|later)\b/i,
  /(لا|مو هلق|ليس الآن|بعد شوي|لاحقاً|مو الآن)/i,
];

const FOLLOW_UP_PATTERNS = [
  /\b(this|that|it|them|those|what about|and this|and that|compare them)\b/i,
  /(هاد|هذا|هاي|هذي|هلق|طيب هاد|وهذا|وهلأ|شو رأيك|قارنهم|هدول|هني|هديك|هون|هناك|سعرها|سعره)/i,
];

const SEARCH_FRAGMENT_PATTERNS = [
  /\b(apartment|villa|house|home|property|office|shop|land|plot)\b/i,
  /(شقة|شقق|بيت|منزل|فيلا|فلل|عقار|عقارات|مكتب|محل|أرض|ارض)/i,
];

const LOCATION_FRAGMENT_PATTERNS = [
  /\b(in damascus|damascus|mazzeh|mazeeh|mazzah|kafr souseh|kafar souseh|abu rummaneh|mashrou dummar)\b/i,
  /(بدمشق|بداماس|دمشق|المزة|مزة|كفر\s*سوسة|أبو\s*رمانة|مشروع\s*دمر)/i,
];

const INVESTMENT_FRAGMENT_PATTERNS = [
  /\b(investment|invest|roi|yield|cash flow)\b/i,
  /(استثمار|للاستثمار|استثماري|عائد)/i,
];

const PRICE_FRAGMENT_PATTERNS = [
  /\b(price|fair|overpriced|too high|cost)\b/i,
  /(سعرها|سعره|غالي|مرتفع|مناسب|سعر)/i,
];

const BUDGET_FRAGMENT_PATTERNS = [
  /\b(under|budget|below)\s*\$?\d+(?:\.\d+)?\s*(k|m|million)?\b/i,
  /(بحدود|حدود|ميزانية|تحت)\s*\d+(?:\.\d+)?/i,
];

const LISTING_FRAGMENT_PATTERNS = [
  /\b(for sale|to buy|for rent|buy|rent|sell)\b/i,
  /(للشراء|للبيع|للإيجار|للايجار|شراء|بيع|إيجار|ايجار)/i,
];

const ROOM_FRAGMENT_PATTERNS = [
  /\b\d+\s*(rooms?|bedrooms?)\b/i,
  /(\d+|غرفتين|غرفة|غرف)\s*(غرف|غرفة)/i,
];

const COMPARE_FRAGMENT_PATTERNS = [
  /\b(compare|vs|versus|better area|this area)\b/i,
  /(قارن|مقارنة|قارنهم|بينهم|هالمنطقة|هذه المنطقة|هاد الحي)/i,
];

const PARTIAL_SEARCH_PATTERNS = [
  /^بدي\s*شا?$/i,
  /^اريد\s*ش/i,
  /^i want\s+ap\.{0,3}$/i,
  /^want\s+ap\.{0,3}$/i,
];

const ARABIC_RE = /[\u0600-\u06FF]/;

export function classifyRealEstateRequest(params: {
  message: string;
  hasRealEstateContext?: boolean;
  contextHints?: string[];
}): RealEstateClassification {
  const normalizedMessage = normalizeRealEstateText(params.message);
  const language: RealEstateLanguage = ARABIC_RE.test(params.message) ? 'ar' : 'en';
  const contextText = (params.contextHints || []).join(' ');
  const contextRealEstateScore = countPatternMatches(contextText, REAL_ESTATE_PATTERNS);
  const hasRealEstateContext =
    Boolean(params.hasRealEstateContext) || contextRealEstateScore > 0;
  const hasGreeting = GREETING_PATTERNS.some((pattern) => pattern.test(normalizedMessage));
  const hasAcknowledgement = ACKNOWLEDGEMENT_PATTERNS.some((pattern) => pattern.test(normalizedMessage));
  const hasConfirmationYes = CONFIRMATION_YES_PATTERNS.some((pattern) => pattern.test(normalizedMessage));
  const hasConfirmationNo = CONFIRMATION_NO_PATTERNS.some((pattern) => pattern.test(normalizedMessage));
  const realEstateScore = countPatternMatches(normalizedMessage, REAL_ESTATE_PATTERNS);
  const offTopicScore = countPatternMatches(normalizedMessage, OFF_TOPIC_PATTERNS);
  const hasFollowUpSignal = FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(normalizedMessage));

  if (hasAcknowledgement && offTopicScore === 0) {
    return {
      domain: 'IN_SCOPE_REAL_ESTATE',
      intent: 'ACKNOWLEDGEMENT',
      language,
      normalizedMessage,
    };
  }

  if (hasRealEstateContext && hasConfirmationYes && offTopicScore === 0) {
    return {
      domain: 'IN_SCOPE_REAL_ESTATE',
      intent: 'CONFIRMATION_YES',
      language,
      normalizedMessage,
    };
  }

  if (hasRealEstateContext && hasConfirmationNo && offTopicScore === 0) {
    return {
      domain: 'IN_SCOPE_REAL_ESTATE',
      intent: 'CONFIRMATION_NO',
      language,
      normalizedMessage,
    };
  }

  if (hasGreeting && offTopicScore === 0) {
    return {
      domain: 'IN_SCOPE_REAL_ESTATE',
      intent: 'SMALL_TALK_ALLOWED',
      language,
      normalizedMessage,
    };
  }

  if (realEstateScore >= 1 && offTopicScore === 0) {
    return {
      domain: 'IN_SCOPE_REAL_ESTATE',
      intent: detectRealEstateIntent(normalizedMessage, {
        hasRealEstateContext,
        hasGreeting,
      }),
      language,
      normalizedMessage,
    };
  }

  if ((hasRealEstateContext && hasFollowUpSignal && offTopicScore === 0) || (hasGreeting && hasRealEstateContext)) {
    return {
      domain: 'IN_SCOPE_REAL_ESTATE',
      intent: detectRealEstateIntent(normalizedMessage, {
        hasRealEstateContext,
        hasGreeting,
      }),
      language,
      normalizedMessage,
    };
  }

  const recovery = recoverRealEstateIntent({
    message: normalizedMessage,
    language,
    hasRealEstateContext,
  });

  if (recovery.inScope) {
    return {
      domain: 'IN_SCOPE_REAL_ESTATE',
      intent: recovery.intent,
      language,
      normalizedMessage,
      needsClarification: recovery.needsClarification,
      clarificationQuestion: recovery.clarificationQuestion,
    };
  }

  if (offTopicScore > 0 && realEstateScore === 0) {
    return {
      domain: 'OUT_OF_SCOPE',
      intent: 'UNKNOWN_REAL_ESTATE',
      language,
      normalizedMessage,
    };
  }

  return {
    domain: 'OUT_OF_SCOPE',
    intent: 'UNKNOWN_REAL_ESTATE',
    language,
    normalizedMessage,
  };
}

export function recoverRealEstateIntent(params: {
  message: string;
  language: RealEstateLanguage;
  hasRealEstateContext?: boolean;
}): RealEstateIntentRecovery {
  const normalizedMessage = normalizeRealEstateText(params.message);
  const hasRealEstateContext = Boolean(params.hasRealEstateContext);
  const realEstateScore = countPatternMatches(normalizedMessage, REAL_ESTATE_PATTERNS);
  const offTopicScore = countPatternMatches(normalizedMessage, OFF_TOPIC_PATTERNS);

  if (offTopicScore > 0 && realEstateScore === 0) {
    return {
      inScope: false,
      intent: 'UNKNOWN_REAL_ESTATE',
    };
  }

  if (
    hasRealEstateContext &&
    (FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(normalizedMessage)) ||
      LISTING_FRAGMENT_PATTERNS.some((pattern) => pattern.test(normalizedMessage)) ||
      ROOM_FRAGMENT_PATTERNS.some((pattern) => pattern.test(normalizedMessage)) ||
      BUDGET_FRAGMENT_PATTERNS.some((pattern) => pattern.test(normalizedMessage)))
  ) {
    if (PRICE_FRAGMENT_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
      return {
        inScope: true,
        intent: 'PRICE_ESTIMATION',
      };
    }

    if (COMPARE_FRAGMENT_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
      return {
        inScope: true,
        intent: 'AREA_COMPARISON',
      };
    }

    return {
      inScope: true,
      intent: 'FOLLOW_UP_CONTEXTUAL',
    };
  }

  if (PARTIAL_SEARCH_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return {
      inScope: true,
      intent: 'PROPERTY_SEARCH',
      needsClarification: true,
      clarificationQuestion: buildClarificationReply('PROPERTY_SEARCH_PARTIAL', params.language),
    };
  }

  if (SEARCH_FRAGMENT_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return {
      inScope: true,
      intent: 'PROPERTY_SEARCH',
      needsClarification: true,
      clarificationQuestion: buildClarificationReply('PROPERTY_SEARCH_TYPE', params.language),
    };
  }

  if (LOCATION_FRAGMENT_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return {
      inScope: true,
      intent: 'PROPERTY_SEARCH',
      needsClarification: true,
      clarificationQuestion: buildClarificationReply('PROPERTY_SEARCH_LOCATION', params.language),
    };
  }

  if (INVESTMENT_FRAGMENT_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return {
      inScope: true,
      intent: 'INVESTMENT_ADVICE',
      needsClarification: true,
      clarificationQuestion: buildClarificationReply('INVESTMENT_CLARIFY', params.language),
    };
  }

  if (BUDGET_FRAGMENT_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return {
      inScope: true,
      intent: hasRealEstateContext ? 'FOLLOW_UP_CONTEXTUAL' : 'PROPERTY_SEARCH',
      needsClarification: !hasRealEstateContext,
      clarificationQuestion: hasRealEstateContext
        ? undefined
        : buildClarificationReply('BUDGET_CLARIFY', params.language),
    };
  }

  if (ROOM_FRAGMENT_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return {
      inScope: true,
      intent: hasRealEstateContext ? 'FOLLOW_UP_CONTEXTUAL' : 'PROPERTY_SEARCH',
      needsClarification: !hasRealEstateContext,
      clarificationQuestion: hasRealEstateContext
        ? undefined
        : buildClarificationReply('BUDGET_CLARIFY', params.language),
    };
  }

  return {
    inScope: false,
    intent: 'UNKNOWN_REAL_ESTATE',
  };
}

export function buildOutOfScopeReply(language: RealEstateLanguage): string {
  return pickVariant(
    language === 'ar'
      ? [
          'أنا مختص بالعقارات فقط، لكن إذا أردت مساعدة في شراء أو بيع أو تقييم عقار فأنا جاهز.',
          'يمكنني مساعدتك في العقارات فقط، مثل البيع والشراء والتسعير وتحليل السوق.',
          'هذا خارج نطاقي، لأنني مساعد عقاري متخصص. إذا كان لديك سؤال عن عقار أو منطقة أو سعر يمكنني مساعدتك.',
        ]
      : [
          'I’m specialized in real estate only. I can help with buying, selling, pricing, or property recommendations.',
          'That’s outside my scope. I focus on real-estate questions such as valuation, market analysis, and property search.',
          'I handle real-estate topics only. If you want help with a property, district, pricing, or recommendations, I can help.',
        ],
  );
}

export function buildRealEstateGreetingReply(language: RealEstateLanguage): string {
  return pickVariant(
    language === 'ar'
      ? [
          'أهلاً وسهلاً. كيف أستطيع مساعدتك في شراء أو بيع أو استثمار عقاري؟',
          'أهلاً بك، أنا هنا لمساعدتك في العقارات. هل تبحث عن شراء، بيع، أو استثمار؟',
          'مرحباً، جاهز أساعدك في العقارات: شراء، بيع، إيجار، تسعير، أو تحليل سوق.',
        ]
      : [
          'Hello! I’m here to help with real-estate questions. Are you looking to buy, sell, rent, or invest?',
          'Hi! I can help with properties, pricing, market analysis, and recommendations.',
          'Hello. I’m your real-estate assistant, ready to help with buying, selling, renting, or valuation.',
        ],
  );
}

export function buildAcknowledgementReply(language: RealEstateLanguage): string {
  return pickVariant(
    language === 'ar'
      ? [
          'على الرحب والسعة. إذا أردت مساعدة أخرى في التسعير أو البيع أو شراء عقار فأنا جاهز.',
          'يسعدني ذلك. إذا احتجت متابعة في العقارات أو التسعير فأنا معك.',
          'أهلاً بك دائماً. إذا أردت المتابعة في البيع أو الشراء أو التقييم فأنا جاهز.',
        ]
      : [
          'You’re welcome. If you want more help with pricing, selling, or finding a property, I’m ready.',
          'Glad to help. If you want to continue with real-estate pricing, buying, or selling, I’m here.',
          'Any time. If you need more help with properties or valuation, I’m ready.',
        ],
  );
}

export function buildConfirmationReply(
  params: {
    language: RealEstateLanguage;
    confirmed: boolean;
    hasActionableContext?: boolean;
  },
): string {
  if (params.language === 'ar') {
    if (params.confirmed) {
      return params.hasActionableContext
        ? 'ممتاز. أكمل معك حسب الخطوة الحالية. إذا أردت التطبيق المباشر أو تضييق الطلب اكتب لي ما الذي تفضله.'
        : 'ممتاز. أخبرني فقط ما الخطوة العقارية التي تريد أن نكملها الآن.';
    }
    return params.hasActionableContext
      ? 'لا مشكلة. يمكننا المتابعة بطريقة أخرى داخل نفس الملف العقاري أو الانتقال للسؤال التالي.'
      : 'لا بأس. إذا أردت ننتقل مباشرة إلى سؤالك العقاري التالي.';
  }

  if (params.confirmed) {
    return params.hasActionableContext
      ? 'Great. We can continue from the current real-estate step. If you want to apply the suggestion or refine it, tell me what you prefer.'
      : 'Great. Tell me which real-estate step you want to continue with.';
  }
  return params.hasActionableContext
    ? 'No problem. We can continue in a different way within the same real-estate task or move to the next question.'
    : 'No problem. We can move directly to your next real-estate question.';
}

export function buildUnknownRealEstateReply(language: RealEstateLanguage): string {
  return language === 'ar'
    ? 'أستطيع مساعدتك في الشراء أو البيع أو الإيجار أو مقارنة المناطق أو تقدير السعر. اذكر فقط المنطقة ونوع العقار والميزانية أو المساحة لأعطيك جواباً عملياً.'
    : 'I can help with buying, selling, renting, price guidance, district comparison, and property recommendations. Share the area, property type, budget, or size and I will give you a practical answer.';
}

export function buildClarificationReply(
  kind:
    | 'PROPERTY_SEARCH_PARTIAL'
    | 'PROPERTY_SEARCH_TYPE'
    | 'PROPERTY_SEARCH_LOCATION'
    | 'INVESTMENT_CLARIFY'
    | 'BUDGET_CLARIFY',
  language: RealEstateLanguage,
): string {
  if (language === 'ar') {
    if (kind === 'PROPERTY_SEARCH_PARTIAL') {
      return 'هل تقصد شراء شقة أو عقار؟';
    }
    if (kind === 'PROPERTY_SEARCH_TYPE') {
      return 'هل تريد شراء أم إيجار؟';
    }
    if (kind === 'PROPERTY_SEARCH_LOCATION') {
      return 'هل تبحث عن عقار في دمشق للشراء أم للإيجار؟';
    }
    if (kind === 'INVESTMENT_CLARIFY') {
      return 'هل تريد منطقة مناسبة للاستثمار أم عقاراً محدداً؟';
    }
    return 'أي منطقة تقصد؟';
  }

  if (kind === 'PROPERTY_SEARCH_PARTIAL') {
    return 'Do you mean buying an apartment or a property?';
  }
  if (kind === 'PROPERTY_SEARCH_TYPE') {
    return 'Do you want to buy or rent?';
  }
  if (kind === 'PROPERTY_SEARCH_LOCATION') {
    return 'Are you looking to buy or rent in Damascus?';
  }
  if (kind === 'INVESTMENT_CLARIFY') {
    return 'Do you want an investment area suggestion or a specific property?';
  }
  return 'Which area do you mean?';
}

function pickVariant(options: string[]): string {
  return options[Math.floor(Math.random() * options.length)] || options[0] || '';
}

export function buildRealEstateConceptReply(
  term: string,
  language: RealEstateLanguage,
): string {
  const key = normalizeRealEstateText(term);

  if (/(roi|return on investment|عائد الاستثمار)/i.test(key)) {
    return language === 'ar'
      ? 'عائد الاستثمار ROI هو نسبة الربح السنوي إلى تكلفة شراء العقار. في العقار السكني يُحسب غالباً من صافي الإيجار السنوي بعد المصاريف مقارنة بسعر الشراء.'
      : 'ROI in real estate is the annual return compared with the total acquisition cost. It is usually estimated from net annual rent after costs versus purchase price.';
  }

  if (/(yield|rental yield|عائد ايجاري|عائد الإيجار)/i.test(key)) {
    return language === 'ar'
      ? 'العائد الإيجاري هو نسبة الدخل الإيجاري السنوي إلى سعر شراء العقار. كلما كان العائد أعلى مع طلب إيجاري مستقر، كانت الجاذبية الاستثمارية أفضل.'
      : 'Rental yield is the annual rental income as a percentage of the property purchase price. Higher yield with stable rental demand usually means a stronger investment case.';
  }

  if (/(mortgage|loan|تمويل|رهن عقاري)/i.test(key)) {
    return language === 'ar'
      ? 'التمويل العقاري يعني شراء العقار بدفعة أولى ثم سداد الباقي على أقساط. القرار الصحيح يعتمد على الدفعة الأولى، القسط الشهري، الفائدة، واستقرار دخلك.'
      : 'A mortgage is financing a property through an upfront down payment plus scheduled repayments. The right choice depends on down payment, monthly installment, interest cost, and income stability.';
  }

  if (/(price per meter|sqm|متر مربع|سعر المتر)/i.test(key)) {
    return language === 'ar'
      ? 'سعر المتر هو أفضل نقطة بداية للمقارنة بين العقارات في نفس المنطقة والنوع. لكنه لا يكفي وحده، لأن الإكساء والطابق والموقع الدقيق والخدمات تؤثر بقوة على السعر النهائي.'
      : 'Price per square meter is a strong starting point for comparing similar properties in the same area and category, but finish quality, floor, micro-location, and services still matter a lot.';
  }

  return language === 'ar'
    ? 'أستطيع شرح مفاهيم مثل ROI والعائد الإيجاري وسعر المتر والتقييم والاستثمار والشراء مقابل الإيجار بطريقة عملية ومباشرة.'
    : 'I can explain concepts like ROI, rental yield, price per meter, valuation, investment strategy, and rent-versus-buy in a practical way.';
}

export function extractComparisonTargets(message: string): string[] {
  const normalized = normalizeRealEstateText(message);
  const aliases = [
    { canonical: 'damascus', patterns: [/دمشق/i, /\bdamascus\b/i, /الشام/i] },
    { canonical: 'rif dimashq', patterns: [/ريف\s*دمشق/i, /\brif\s*dimashq\b/i, /\brural\s*damascus\b/i] },
    { canonical: 'mazzeh', patterns: [/المزة/i, /\bmazzeh\b/i, /\bmazeeh\b/i, /\bmazzah\b/i] },
    { canonical: 'qassaa', patterns: [/القصاع/i, /قصاع/i, /\bqassaa\b/i, /\bqasaa\b/i] },
    { canonical: 'kafr souseh', patterns: [/كفر\s*سوسة/i, /كفرسوسة/i, /\bkafar?\s*souseh\b/i, /\bkafr\s*souseh\b/i] },
    { canonical: 'mashrou dummar', patterns: [/مشروع\s*دمر/i, /\bmashrou\s*dummar\b/i] },
    { canonical: 'abu rummaneh', patterns: [/أبو\s*رمانة/i, /\babu\s*rummaneh\b/i] },
  ];

  const found = aliases
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(normalized)))
    .map((entry) => entry.canonical);

  return Array.from(new Set(found)).slice(0, 2);
}

function detectRealEstateIntent(
  normalizedMessage: string,
  options: { hasRealEstateContext?: boolean; hasGreeting?: boolean },
): RealEstateAssistantIntent {
  if (options.hasGreeting) {
    return 'GREETING_REAL_ESTATE';
  }

  if (
    /(قارن|مقارنة|compare|vs\b|versus|بين .* و|بين .* و بين)/i.test(normalizedMessage)
  ) {
    return 'AREA_COMPARISON';
  }

  if (
    /(recommend|suggest|best option|best property|رشح|اقترح|نصّحني|انسب عقار)/i.test(
      normalizedMessage,
    )
  ) {
    return 'PROPERTY_RECOMMENDATION';
  }

  if (
    /(أبحث عن (عقار|شقة|شقق|بيت|منزل|فيلا|أرض|ارض|مكتب|محل)|بدور على (عقار|شقة|شقق|بيت|منزل|فيلا|أرض|ارض|مكتب|محل)|بدي (عقار|شقة|شقق|بيت|منزل|فيلا|أرض|ارض|مكتب|محل)|أريد (عقار|شقة|شقق|بيت|منزل|فيلا|أرض|ارض|مكتب|محل)|اريد (عقار|شقة|شقق|بيت|منزل|فيلا|أرض|ارض|مكتب|محل)|looking for (a |an )?(property|apartment|villa|house|home|office|shop|land)|need (a |an )?(property|apartment|villa|house|home|office|shop|land)|want (a |an )?(property|apartment|villa|house|home|office|shop|land)|apartment in|villa in|house in|property under|عقار لعيلة)/i.test(
      normalizedMessage,
    )
  ) {
    return 'PROPERTY_SEARCH';
  }

  if (
    /(overpriced|fair price|too high|price okay|estimate (the )?price|property valuation|apartment valuation|house valuation|villa valuation|is this property price|is this apartment price|property price|apartment price|house price|villa price|سعر العقار|سعر الشقة|سعر الشقق|سعر البيت|سعر المنزل|سعر الفيلا|سعر الأرض|السعر مناسب للعقار|السعر مناسب للشقة|تقييم عقار|تقييم شقة|تسعير عقار|تسعير شقة|غالي.*(شقة|عقار|بيت|منزل|فيلا)|مرتفع.*(شقة|عقار|بيت|منزل|فيلا)|سعر هالعقار|سعر هالشقة)/i.test(
      normalizedMessage,
    )
  ) {
    return 'PRICE_ESTIMATION';
  }

  if (
    /(market|trend|price per meter|area performance|district performance|تحليل السوق|السوق|اتجاه السوق|المتر|اتجاه الأسعار)/i.test(
      normalizedMessage,
    )
  ) {
    return 'MARKET_ANALYSIS';
  }

  if (/(investment|roi|yield|cash flow|استثمار|عائد|استثماري)/i.test(normalizedMessage)) {
    return 'INVESTMENT_ADVICE';
  }

  if (
    /(rent or buy|rental|lease|tenant|landlord|ايجار|إيجار|استئجار|مستأجر|مؤجر)/i.test(
      normalizedMessage,
    )
  ) {
    return 'RENTAL_GUIDANCE';
  }

  if (
    /(buy (a |an )?(property|apartment|villa|house|home|office|shop|land) now|wait to buy (a |an )?(property|apartment|villa|house|home|office|shop|land)|first home|first buyer|شراء عقار|شراء شقة|شراء بيت|شراء منزل|شراء فيلا|اشتري (عقار|شقة|بيت|منزل|فيلا|أرض|ارض)|شراء الآن للعقار|اشتري هلق (عقار|شقة|بيت|منزل|فيلا)|أنتظر شراء عقار|انتظر شراء شقة)/i.test(
      normalizedMessage,
    )
  ) {
    return 'BUYER_GUIDANCE';
  }

  if (/(sell (a |an )?(property|apartment|villa|house|home|office|shop|land) now|list my property|sell my property|بيع عقار|بيع شقة|بيع بيت|بيع منزل|بيع فيلا|ابيع (عقار|شقة|بيت|منزل|فيلا|أرض|ارض)|أبيع (عقار|شقة|بيت|منزل|فيلا|أرض|ارض)|بيع الآن للعقار|ابيع هلق (عقار|شقة|بيت|منزل|فيلا))/i.test(normalizedMessage)) {
    return 'SELLER_GUIDANCE';
  }

  if (/(owner|landlord|my property|أنا مالك|عقاري|عقاراتي|كمحفظة|محفظتي)/i.test(normalizedMessage)) {
    return 'OWNER_SUPPORT';
  }

  if (/(details|amenities|rooms|bedrooms|bathrooms|تفاصيل العقار|غرف|حمامات|طابق)/i.test(normalizedMessage)) {
    return 'PROPERTY_DETAILS';
  }

  if (/(what is|explain|meaning of|يعني شو|ما هو|اشرح|شو يعني)/i.test(normalizedMessage)) {
    return 'REAL_ESTATE_FAQ';
  }

  if (options.hasRealEstateContext && FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return 'FOLLOW_UP_CONTEXTUAL';
  }

  return 'UNKNOWN_REAL_ESTATE';
}

function hasRealEstateSignals(value: string): boolean {
  return countPatternMatches(value, REAL_ESTATE_PATTERNS) > 0;
}

function countPatternMatches(value: string, patterns: RegExp[]): number {
  if (!value) {
    return 0;
  }

  return patterns.reduce((score, pattern) => score + (pattern.test(value) ? 1 : 0), 0);
}

export function normalizeRealEstateText(value: string): string {
  return String(value || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
