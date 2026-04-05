import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BuyerHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listBuyerHistory(params: { buyerId: number; limit?: number }) {
    const buyerId = this.parsePositiveInt(params.buyerId, 'buyerId');
    const limit = this.parseLimit(params.limit, 50, 1, 200);

    const delegate = (this.prisma as any).buyerRecommendationLog;
    const rows = await delegate.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        buyerId: true,
        sessionId: true,
        intent: true,
        queryJson: true,
        resultsJson: true,
        marketContextJson: true,
        createdAt: true,
      },
    });

    return {
      items: rows.map((row) => this.serializeRow(row)),
    };
  }

  async getBuyerHistoryById(params: { buyerId: number; id: number }) {
    const buyerId = this.parsePositiveInt(params.buyerId, 'buyerId');
    const id = this.parsePositiveInt(params.id, 'id');

    const delegate = (this.prisma as any).buyerRecommendationLog;
    const row = await delegate.findUnique({
      where: { id },
      select: {
        id: true,
        buyerId: true,
        sessionId: true,
        intent: true,
        queryJson: true,
        resultsJson: true,
        marketContextJson: true,
        createdAt: true,
      },
    });

    if (!row) {
      throw new NotFoundException('Buyer recommendation log not found');
    }
    if (Number(row.buyerId) !== buyerId) {
      throw new ForbiddenException('You cannot access this recommendation log');
    }

    return this.serializeRow(row);
  }

  async exportHistory(params: { days?: number; format?: 'json' | 'csv' }) {
    const days = this.parseLimit(params.days, 30, 1, 3650);
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const delegate = (this.prisma as any).buyerRecommendationLog;
    const rows = await delegate.findMany({
      where: {
        createdAt: {
          gte: fromDate,
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        buyerId: true,
        sessionId: true,
        intent: true,
        queryJson: true,
        resultsJson: true,
        marketContextJson: true,
        createdAt: true,
      },
    });

    const normalized = rows.map((row) => {
      const results = Array.isArray(row.resultsJson) ? row.resultsJson : [];
      const topPropertyIds = results
        .map((item: any) => Number(item?.id || item?.propertyId || 0))
        .filter((value: number) => Number.isInteger(value) && value > 0)
        .join(',');
      const topScores = results
        .map((item: any) => Number(item?.score))
        .filter((value: number) => Number.isFinite(value))
        .map((value: number) => value.toFixed(4))
        .join(',');

      return {
        id: row.id,
        buyerId: row.buyerId,
        sessionId: row.sessionId,
        intent: row.intent,
        createdAt: row.createdAt.toISOString(),
        queryJson: JSON.stringify(row.queryJson ?? {}),
        marketContextJson: JSON.stringify(row.marketContextJson ?? {}),
        topPropertyIds,
        topScores,
      };
    });

    if ((params.format || 'json') === 'csv') {
      return this.toCsv(normalized);
    }

    return {
      days,
      count: normalized.length,
      items: normalized,
    };
  }

  private serializeRow(row: any) {
    return {
      id: row.id,
      buyerId: row.buyerId,
      sessionId: row.sessionId,
      intent: row.intent,
      queryJson: row.queryJson,
      resultsJson: row.resultsJson,
      marketContextJson: row.marketContextJson,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private parsePositiveInt(value: number, fieldName: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }
    return parsed;
  }

  private parseLimit(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = value == null ? fallback : Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException(`value must be an integer between ${min} and ${max}`);
    }
    return parsed;
  }

  private toCsv(rows: Array<Record<string, unknown>>) {
    const headers = [
      'id',
      'buyerId',
      'sessionId',
      'intent',
      'createdAt',
      'queryJson',
      'marketContextJson',
      'topPropertyIds',
      'topScores',
    ];
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(
        headers
          .map((header) => this.escapeCsv(row[header]))
          .join(','),
      );
    }
    return lines.join('\n');
  }

  private escapeCsv(value: unknown): string {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }
}
