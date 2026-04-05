import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommissionsService {
  constructor(private prisma: PrismaService) {}

  // سجل العمولة
  async createCommission(invoiceId: number, amount: number, percentage: number) {
    return this.prisma.commission.create({
      data: {
        invoiceId,
        amount,
        percentage,
      },
    });
  }

  // جميع أرباح المنصة
  async getAll() {
    return this.prisma.commission.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        invoice: true,
      },
    });
  }

  // مجموع الأرباح
  async getTotal() {
    const result = await this.prisma.commission.aggregate({
      _sum: { amount: true },
    });

    return { totalEarnings: result._sum.amount ?? 0 };
  }
}
