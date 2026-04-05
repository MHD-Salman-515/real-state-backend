import { Injectable } from '@nestjs/common';
import { SellerPriceCoreResult } from '../advisor.types';
import { AdvisorCachePort } from './advisor-cache.port';

@Injectable()
export class AdvisorCacheService implements AdvisorCachePort {
  private readonly sellerPriceCache = new Map<string, SellerPriceCoreResult>();

  async getSellerPrice(key: string): Promise<SellerPriceCoreResult | null> {
    return this.sellerPriceCache.get(key) ?? null;
  }

  async setSellerPrice(key: string, value: SellerPriceCoreResult): Promise<void> {
    this.sellerPriceCache.set(key, value);
  }
}
