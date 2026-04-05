import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketLogsService {
  constructor(private prisma: PrismaService) {}

  async createLog(ticketId: number, userId: number, action: string) {
    return this.prisma.ticketlog.create({
      data: {
        ticketId,
        userId,
        action,
      },
    });
  }

  async getLogs(ticketId: number) {
    return this.prisma.ticketlog.findMany({
      where: { ticketId },
      orderBy: { actionDate: 'desc' },
      include: {
        user: {
          select: { id: true, fullName: true, role: true },
        },
      },
    });
  }
}
