import { SellerPriceCoreResult } from '../advisor.types';

export const ADVISOR_CACHE = Symbol('ADVISOR_CACHE');

export interface AdvisorCachePort {
  getSellerPrice(key: string): Promise<SellerPriceCoreResult | null>;
  setSellerPrice(key: string, value: SellerPriceCoreResult): Promise<void>;
}
