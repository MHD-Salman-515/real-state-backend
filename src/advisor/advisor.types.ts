import { AdvisorLanguage } from './utils/language-detector';
import { ExplainTrace } from './explanation/explain-trace.helper';

export interface PriceRangeSyp {
  min: number;
  max: number;
}

export interface SellerPricingCitations {
  area_key: string;
  sample_count: number;
  updated_at: Date;
}

export interface SellerPriceResponse {
  optimal_price_syp: number;
  optimal_range_syp: PriceRangeSyp;
  fast_sale_price_syp: number;
  fast_sale_range_syp: PriceRangeSyp;
  confidence: number;
  confidence_meta?: {
    sample_score: number;
    recency_score: number;
    stability_score: number;
  };
  summary: string;
  fx_used: number;
  fx_rate_id?: number;
  fx_effective_at?: Date;
  citations: SellerPricingCitations;
  explain_trace?: ExplainTrace;
  log_id?: string;
}

export interface SellerPriceCoreResult {
  optimal_price_syp: number;
  optimal_range_syp: PriceRangeSyp;
  fast_sale_price_syp: number;
  fast_sale_range_syp: PriceRangeSyp;
  confidence: number;
  confidence_meta?: {
    sample_score: number;
    recency_score: number;
    stability_score: number;
  };
  fx_used: number;
  fx_rate_id?: number;
  fx_effective_at?: Date;
  citations: SellerPricingCitations;
  explain_trace?: ExplainTrace;
}

export interface SellerPriceSummaryInput {
  language: AdvisorLanguage;
  optimal_price_syp: number;
  fast_sale_price_syp: number;
}

export type BuyerVerdict = 'cheap' | 'fair' | 'expensive';

export interface BuyerEvaluateResponse {
  verdict: BuyerVerdict;
  ask_price_syp: number;
  fair_range_syp: PriceRangeSyp;
  confidence: number;
  confidence_meta?: {
    sample_score: number;
    recency_score: number;
    stability_score: number;
  };
  summary: string;
  fx_used: number;
  fx_rate_id?: number;
  fx_effective_at?: Date;
  citations: SellerPricingCitations;
  explain_trace?: ExplainTrace;
  log_id?: string;
}

export type AdvisorExplainLanguage = 'ar_sy' | 'ar' | 'en';

export interface AdvisorExplainResponse {
  text: string;
  language: AdvisorExplainLanguage;
}

export interface AdvisorTrackResponse {
  id: string;
  log_id: string;
  action:
    | 'accepted_optimal'
    | 'accepted_fast'
    | 'accepted_balanced'
    | 'accepted_profit'
    | 'edited'
    | 'ignored';
  final_price_syp: string;
}

export interface AdvisorAnalyticsResponse {
  days: number;
  totals: {
    suggestions: number;
    outcomes: number;
  };
  outcomes: {
    accepted_optimal: number;
    accepted_fast: number;
    edited: number;
    ignored: number;
    other: number;
  };
}

export interface AdvisorInsightsResponse {
  area_scope: {
    city: string;
    district?: string;
    property_type?: string;
  };
  days_window: number;
  sample_count: number;
  stats: {
    median_ppm2_syp: number;
    avg_ppm2_syp: number;
    min_ppm2_syp: number;
    max_ppm2_syp: number;
    volatility_index: number;
    trend_last_30_days: {
      direction: 'up' | 'down' | 'flat';
      change_ratio: number;
    };
    suggested_percentile?: number;
  };
  confidence_meta?: {
    sample_score: number;
    recency_score: number;
    stability_score: number;
  };
  message: string;
  language: 'ar_sy' | 'ar' | 'en';
  explain_trace?: ExplainTrace;
}

export interface AdvisorSimulationResponse {
  area_scope: {
    city: string;
    district: string;
    property_type: string;
  };
  days_window: number;
  sample_count: number;
  median_ppm2_syp: number;
  subject_ppm2_syp: number;
  deviation_percent: number;
  volatility_index: number;
  trend_last_30_days: {
    direction: 'up' | 'down' | 'flat';
    change_ratio: number;
  };
  risk_score: number;
  sale_speed_class: 'fast' | 'normal' | 'slow' | 'very_slow';
  message: string;
  language: 'ar_sy' | 'ar' | 'en';
  explain_trace?: ExplainTrace;
}

export interface AdvisorEvaluateResponse {
  estimated_price: number;
  average_price_per_m2: number;
  median_price_per_m2: number;
  comparables_found: number;
  selected_comparables: number;
  evaluation: 'underpriced' | 'fair_price' | 'overpriced';
  difference_percent: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
}

export interface AdvisorInvestmentAnalysisResponse {
  estimated_price: number;
  evaluation: 'underpriced' | 'fair_price' | 'overpriced';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
  difference_percent: number;
  investment_score: number;
  market_status: 'HOT' | 'STABLE' | 'UNDERVALUED';
  advice: string;
}
