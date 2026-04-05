import { Injectable } from '@nestjs/common';

export type AuthHitEntry = {
  at: string;
  method: string;
  path: string;
  ip: string;
  userAgent: string;
  contentType: string;
  contentLength: string;
  hasEmail: boolean;
  passwordLength: number;
  statusCode: number;
  durationMs: number;
};

@Injectable()
export class AuthHitsService {
  private readonly maxEntries = 200;
  private readonly hits: AuthHitEntry[] = [];

  record(entry: AuthHitEntry): void {
    this.hits.push(entry);
    if (this.hits.length > this.maxEntries) {
      this.hits.splice(0, this.hits.length - this.maxEntries);
    }
  }

  latest(limit = 20): AuthHitEntry[] {
    const size = Math.max(1, Math.min(limit, this.maxEntries));
    return this.hits.slice(-size).reverse();
  }
}
