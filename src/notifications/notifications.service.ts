import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

export interface CreateNotificationDto {
  userId: number;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  sendEmail?: boolean;
  emailSubject?: string;
  emailHtml?: string;
}

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly sseClients = new Map<number, Set<any>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  onModuleDestroy() {
    this.sseClients.clear();
  }

  async create(dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        isRead: false,
        metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue,
      },
    });

    this.pushSse(dto.userId, { event: 'notification', data: notification });

    if (dto.sendEmail && dto.emailSubject && dto.emailHtml) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { email: true },
      });
      if (user) {
        await this.sendNotificationEmail(user.email, dto.emailSubject, dto.emailHtml).catch(() => {});
      }
    }

    return notification;
  }

  async getForUser(userId: number, limit = 20) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getUnreadCount(userId: number) {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(id: number, userId: number) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  addSseClient(userId: number, res: any) {
    if (!this.sseClients.has(userId)) {
      this.sseClients.set(userId, new Set());
    }
    this.sseClients.get(userId)!.add(res);
  }

  removeSseClient(userId: number, res: any) {
    this.sseClients.get(userId)?.delete(res);
  }

  private pushSse(userId: number, payload: { event: string; data: unknown }) {
    const clients = this.sseClients.get(userId);
    if (!clients || clients.size === 0) return;
    const line = `event: ${payload.event}\ndata: ${JSON.stringify(payload.data)}\n\n`;
    for (const res of clients) {
      try {
        res.write(line);
      } catch {
        clients.delete(res);
      }
    }
  }

  private async sendNotificationEmail(to: string, subject: string, html: string) {
    const EMOJI_MAP: Record<string, string> = {
      appointment: '📅',
      invoice: '🧾',
      ticket: '🔧',
      payment: '💰',
      system: '🔔',
    };
    const typeKey = Object.keys(EMOJI_MAP).find((k) => subject.toLowerCase().includes(k)) ?? 'system';
    const emoji = EMOJI_MAP[typeKey];

    await this.mail.sendMail({
      to,
      subject: `${emoji} ${subject}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:8px;">
          <div style="background:#1d4ed8;color:#fff;padding:16px 24px;border-radius:6px 6px 0 0;">
            <h2 style="margin:0;font-size:18px;">${emoji} ${subject}</h2>
          </div>
          <div style="background:#fff;padding:24px;border-radius:0 0 6px 6px;border:1px solid #e5e7eb;border-top:none;">
            ${html}
          </div>
          <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:16px;">Urbanex Real Estate Platform</p>
        </div>`,
    });
  }
}
