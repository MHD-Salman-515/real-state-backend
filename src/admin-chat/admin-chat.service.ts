import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AdminChatExportRow {
  session_id: number;
  owner_id: number;
  role: string;
  intent: string | null;
  payload_json: string | null;
  content: string;
  created_at: string;
  outcome_action: string | null;
}

@Injectable()
export class AdminChatService {
  constructor(private readonly prisma: PrismaService) {}

  async exportRows(params: {
    days: number;
    sessionId?: number;
    ownerId?: number;
  }): Promise<AdminChatExportRow[]> {
    const from = new Date();
    from.setDate(from.getDate() - params.days);

    const rows = await this.prisma.chatMessage.findMany({
      where: {
        createdAt: { gte: from },
        ...(params.sessionId ? { sessionId: params.sessionId } : {}),
        ...(params.ownerId ? { session: { ownerId: params.ownerId } } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        sessionId: true,
        role: true,
        intent: true,
        payloadJson: true,
        text: true,
        createdAt: true,
        session: {
          select: {
            ownerId: true,
          },
        },
      },
      take: 10000,
    });

    return rows.map((row) => {
      const sanitizedPayload = this.sanitizePayload(row.payloadJson);
      return {
        session_id: row.sessionId,
        owner_id: Number(row.session.ownerId),
        role: row.role,
        intent: row.intent ?? null,
        payload_json: sanitizedPayload ? JSON.stringify(sanitizedPayload) : null,
        content: String(row.text || ''),
        created_at: row.createdAt.toISOString(),
        outcome_action: this.extractOutcomeAction(sanitizedPayload),
      };
    });
  }

  async ragDump(params: {
    days: number;
    sessionId?: number;
    ownerId?: number;
  }) {
    const rows = await this.exportRows(params);

    return rows.map((row, idx) => ({
      id: `${row.session_id}:${idx + 1}`,
      text: [
        `${row.role}: ${row.content}`,
        `intent: ${row.intent || 'none'}`,
        `payload: ${row.payload_json || '{}'}`,
      ].join('\n'),
      metadata: {
        owner_id: row.owner_id,
        session_id: row.session_id,
        intent: row.intent,
        created_at: row.created_at,
      },
    }));
  }

  toCsv(rows: AdminChatExportRow[]): string {
    const headers = [
      'session_id',
      'owner_id',
      'role',
      'intent',
      'payload_json',
      'content',
      'created_at',
      'outcome_action',
    ];

    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(
        [
          row.session_id,
          row.owner_id,
          row.role,
          row.intent ?? '',
          row.payload_json ?? '',
          row.content,
          row.created_at,
          row.outcome_action ?? '',
        ]
          .map((v) => this.escapeCsv(v))
          .join(','),
      );
    }

    return lines.join('\n');
  }

  private escapeCsv(value: unknown): string {
    const str = String(value ?? '');
    if (!/[",\n]/.test(str)) return str;
    return `"${str.replace(/"/g, '""')}"`;
  }

  private sanitizePayload(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const walk = (input: unknown): unknown => {
      if (Array.isArray(input)) {
        return input.map((v) => walk(v));
      }
      if (!input || typeof input !== 'object') return input;

      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
        if (key === 'user_message') continue;
        out[key] = walk(val);
      }
      return out;
    };

    return walk(value) as Record<string, unknown>;
  }

  private extractOutcomeAction(payload: Record<string, unknown> | null): string | null {
    if (!payload) return null;

    const direct = String(payload?.track_action || '').trim();
    if (direct) return direct;

    const suggested = payload?.suggested_actions;
    if (!Array.isArray(suggested)) return null;

    for (const action of suggested as Record<string, unknown>[]) {
      const t = String(action?.track_action || '').trim();
      if (t) return t;
    }

    return null;
  }
}
