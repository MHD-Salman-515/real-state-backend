import { Injectable } from '@nestjs/common';

export interface ConfidenceMeta {
  sample_score: number;
  recency_score: number;
  stability_score: number;
}

@Injectable()
export class ConfidenceService {
  private readonly normalizationBase = 50;

  computeSampleScore(sampleCount: number): number {
    const safeSampleCount = Number.isFinite(sampleCount) ? Math.max(sampleCount, 0) : 0;
    const score =
      Math.log(safeSampleCount + 1) / Math.log(this.normalizationBase);

    return Math.min(Math.max(score, 0), 1);
  }

  computeRecencyScore(updatedAt: Date): number {
    const daysAgo = Math.max(
      0,
      (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysAgo <= 7) return 1;
    if (daysAgo <= 30) return 0.85;
    if (daysAgo <= 90) return 0.65;
    return 0.4;
  }

  computeStabilityScore(cv: number | null): number {
    if (cv == null || !Number.isFinite(cv) || cv < 0) {
      return 0.55;
    }

    if (cv <= 0.12) return 1;
    if (cv <= 0.2) return 0.85;
    if (cv <= 0.3) return 0.7;
    if (cv <= 0.45) return 0.5;
    return 0.3;
  }

  compute(meta: ConfidenceMeta): number {
    const weighted =
      meta.sample_score * 0.45 +
      meta.recency_score * 0.3 +
      meta.stability_score * 0.25;

    return Math.round(Math.min(Math.max(weighted, 0), 1) * 1000) / 1000;
  }
}
