export type AiToolAction =
  | 'APPLY_PRICE'
  | 'OPEN_STRATEGY'
  | 'OPEN_SUGGESTIONS'
  | 'NONE';

export interface AiResponse {
  message: string;
  action?: AiToolAction;
  payload?: any;
}

export interface GenerateOwnerAdvisorReplyInput {
  message: string;
  ownerId: number;
  propertyId?: number;
  district?: string;
}

export interface MarketContext {
  district: string;
  avg_price_m2: number;
  last_update: string;
}

export interface PropertyContext {
  property_id: number;
  area_m2: number | null;
  price: number | null;
  district: string | null;
  type: string | null;
}
