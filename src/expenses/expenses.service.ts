import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) { }

  /**
   * المورد يسجل مصروف → النظام ينشئ فاتورة SERVICE للعميل.
   */
  async createWithInvoice(data: any, supplierId: number) {
    const ticket = await this.prisma.maintenanceTicket.findUnique({
      where: { id: data.ticketId },
      include: { property: true },
    });

    if (!ticket) throw new Error('التذكرة غير موجودة');

    // 1) أنشئ مصروف
    const expense = await this.prisma.expense.create({
      data: {
        amount: data.amount,
        description: data.description,
        ticketId: data.ticketId,
        contractorId: supplierId,
      },
    });

    // 2) هل يوجد فاتورة موجودة مسبقاً لهذه التذكرة؟
    let invoice = await this.prisma.invoice.findFirst({
      where: {
        type: 'SERVICE',
        propertyId: ticket.propertyId,
        clientId: ticket.clientId,
      },
    });

    // 3) إذا لا → ننشئ فاتورة جديدة
    if (!invoice) {
      invoice = await this.prisma.invoice.create({
        data: {
          clientId: ticket.clientId,
          propertyId: ticket.propertyId,
          type: 'SERVICE',
          totalAmount: data.amount,
          createdBy: supplierId, // المورد أنشأها
        },
      });
    } else {
      // 4) إذا موجودة → نحدث المبلغ الإجمالي
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          totalAmount: invoice.totalAmount + data.amount,
        },
      });
    }

    // 5) اربط المصروف بالفاتورة
    await this.prisma.expense.update({
      where: { id: expense.id },
      data: { invoiceId: invoice.id },
    });

    return { message: 'تم تسجيل المصروف وإنشاء الفاتورة', expense, invoice };
  }

  async findAll() {
    return this.prisma.expense.findMany({
      include: {
        ticket: { select: { id: true, category: true } },
        contractor: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findMy(supplierId: number) {
    return this.prisma.expense.findMany({
      where: { contractorId: supplierId },
      include: {
        ticket: { include: { property: true } },
        invoice: true,
      },
      orderBy: { expenseDate: 'desc' },
    });
  }

  findByTicket(ticketId: number, supplierId: number) {
    return this.prisma.expense.findMany({
      where: { ticketId, contractorId: supplierId },
      include: { invoice: true },
      orderBy: { expenseDate: 'desc' },
    });
  }

  async getAllSupplierExpenses() {
    return this.prisma.expense.findMany({
      where: {
        contractor: {
          role: "SUPPLIER",
        },
      },
      include: {
        contractor: true,
        ticket: {
          include: {
            property: true,
          },
        },
        invoice: true,
      },
      orderBy: {
        expenseDate: "desc",
      },
    });
  }


}
