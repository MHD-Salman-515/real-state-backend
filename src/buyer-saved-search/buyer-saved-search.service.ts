import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBuyerSavedSearchDto } from './dto/create-buyer-saved-search.dto';

@Injectable()
export class BuyerSavedSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: { buyerId: number; body: CreateBuyerSavedSearchDto }) {
    const buyerId = this.parseBuyerId(params.buyerId);
    const filtersJson = this.ensureObject(params.body?.filtersJson);
    const normalizedFilters = this.normalizeForHash(filtersJson) as Record<string, unknown>;
    const filtersHash = this.computeFiltersHash(normalizedFilters);
    const title = String(params.body?.title || '').trim() || null;

    const delegate = (this.prisma as any).buyerSavedSearch;
    const existing = await delegate.findUnique({
      where: { filtersHash },
      select: {
        id: true,
        buyerId: true,
        title: true,
        filtersJson: true,
        filtersHash: true,
        createdAt: true,
      },
    });

    if (existing) {
      if (Number(existing.buyerId) !== buyerId) {
        throw new ForbiddenException('Saved search already exists');
      }
      return {
        id: existing.id,
        title: existing.title,
        filtersJson: existing.filtersJson,
        filtersHash: existing.filtersHash,
        createdAt: existing.createdAt.toISOString(),
        existed: true,
      };
    }

    const created = await delegate.create({
      data: {
        buyerId,
        title,
        filtersJson: normalizedFilters,
        filtersHash,
      },
      select: {
        id: true,
        title: true,
        filtersJson: true,
        filtersHash: true,
        createdAt: true,
      },
    });

    return {
      id: created.id,
      title: created.title,
      filtersJson: created.filtersJson,
      filtersHash: created.filtersHash,
      createdAt: created.createdAt.toISOString(),
      existed: false,
    };
  }

  async list(buyerIdInput: number) {
    const buyerId = this.parseBuyerId(buyerIdInput);
    const delegate = (this.prisma as any).buyerSavedSearch;
    const rows = await delegate.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        filtersJson: true,
        filtersHash: true,
        createdAt: true,
      },
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        filtersJson: row.filtersJson,
        filtersHash: row.filtersHash,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async remove(params: { buyerId: number; id: number }) {
    const buyerId = this.parseBuyerId(params.buyerId);
    if (!Number.isInteger(params.id) || params.id <= 0) {
      throw new BadRequestException('id must be a positive integer');
    }

    const delegate = (this.prisma as any).buyerSavedSearch;
    const deleted = await delegate.deleteMany({
      where: {
        id: params.id,
        buyerId,
      },
    });

    if (deleted.count === 0) {
      throw new NotFoundException('Saved search not found');
    }

    return { success: true };
  }

  private parseBuyerId(value: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('Invalid buyer id');
    }
    return parsed;
  }

  private ensureObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('filtersJson must be an object');
    }
    return value as Record<string, unknown>;
  }

  private computeFiltersHash(normalizedFilters: Record<string, unknown>): string {
    const payload = JSON.stringify(normalizedFilters);
    return createHash('sha1').update(payload).digest('hex');
  }

  private normalizeForHash(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.normalizeForHash(item))
        .filter((item) => item !== undefined);
    }

    if (value && typeof value === 'object') {
      const source = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(source).sort()) {
        const normalized = this.normalizeForHash(source[key]);
        if (normalized === undefined || normalized === null) {
          continue;
        }
        out[key] = normalized;
      }
      return out;
    }

    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : undefined;
    }

    return value;
  }
}
