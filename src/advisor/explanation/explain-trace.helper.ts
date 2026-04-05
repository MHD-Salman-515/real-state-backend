export interface ExplainTrace {
  inputs_used: Record<string, unknown>;
  data_sources: {
    areas_price?: Record<string, unknown>;
    market_data?: Record<string, unknown>;
    fx_rate?: Record<string, unknown>;
    external_baseline?: Record<string, unknown> | null;
  };
  computation_steps: Array<{
    step: string;
    value?: unknown;
    note?: string;
  }>;
  confidence_components?: {
    sample_score?: number;
    recency_score?: number;
    stability_score?: number;
    confidence?: number;
  };
  comparables?: Array<Record<string, unknown>>;
}

export function buildExplainTrace(params: {
  inputs_used: Record<string, unknown>;
  data_sources?: {
    areas_price?: Record<string, unknown>;
    market_data?: Record<string, unknown>;
    fx_rate?: Record<string, unknown>;
    external_baseline?: Record<string, unknown> | null;
  };
  computation_steps: Array<{
    step: string;
    value?: unknown;
    note?: string;
  }>;
  confidence_components?: {
    sample_score?: number;
    recency_score?: number;
    stability_score?: number;
    confidence?: number;
  };
  comparables?: Array<Record<string, unknown>>;
}): ExplainTrace {
  return {
    inputs_used: params.inputs_used,
    data_sources: {
      ...(params.data_sources?.areas_price
        ? { areas_price: params.data_sources.areas_price }
        : {}),
      ...(params.data_sources?.market_data
        ? { market_data: params.data_sources.market_data }
        : {}),
      ...(params.data_sources?.fx_rate
        ? { fx_rate: params.data_sources.fx_rate }
        : {}),
      ...(params.data_sources?.external_baseline !== undefined
        ? { external_baseline: params.data_sources.external_baseline }
        : {}),
    },
    computation_steps: params.computation_steps,
    ...(params.confidence_components
      ? { confidence_components: params.confidence_components }
      : {}),
    ...(params.comparables && params.comparables.length > 0
      ? { comparables: params.comparables }
      : {}),
  };
}
