import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) { }

  // -------------------------------------------------------
  // CREATE PAYMENT
  // -------------------------------------------------------
  async create(dto: any, userId: number) {
    const { invoiceId, amount } = dto;

    if (!invoiceId || !amount) {
      throw new Error('invoiceId and amount are required');
    }

    const numericAmount = Number(amount);

    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw new Error('Invalid payment amount');
    }

    // تأكد أن الفاتورة موجودة
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: Number(invoiceId) },
      include: { payments: true },
    });

    if (!invoice) {
      throw new Error(`Invoice #${invoiceId} not found`);
    }

    // -------------------------------------------------------
    // 1) Create payment record
    // -------------------------------------------------------
    const payment = await this.prisma.payment.create({
      data: {
        invoiceId: Number(invoiceId),
        amount: numericAmount,
      },
    });

    // -------------------------------------------------------
    // 2) Update invoice status (PAID / PENDING)
    // -------------------------------------------------------
    await this.updateInvoiceStatus(Number(invoiceId));

    return {
      message: 'Payment recorded successfully',
      payment,
    };
  }



  // -------------------------------------------------------
  // OPTIONAL: Get all payments for an invoice
  // -------------------------------------------------------
  async getPaymentsByInvoice(invoiceId: number) {
    return this.prisma.payment.findMany({
      where: { invoiceId },
      orderBy: { date: 'desc' },
    });
  }


  // -------------------------------------------------------
  // UPDATE INVOICE STATUS AFTER PAYMENT
  // -------------------------------------------------------

  private async updateInvoiceStatus(invoiceId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });

    if (!invoice) return;

    const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);

    const newStatus =
      totalPaid >= invoice.totalAmount ? "PAID" : "PENDING";

    // تحديث حالة الفاتورة
    const updatedInvoice = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: newStatus },
    });

    // 🔥 إذا صارت الفاتورة مدفوعة بالكامل → أنشئ العمولة
    if (newStatus === "PAID") {
      const percentage = updatedInvoice.commissionPercentage; // من الفاتورة نفسها
      const commissionAmount =
        updatedInvoice.totalAmount * (percentage / 100);

      // تجنب إنشاء عمولة مكررة لنفس الفاتورة
      const exists = await this.prisma.commission.findFirst({
        where: { invoiceId },
      });

      if (!exists) {
        await this.prisma.commission.create({
          data: {
            invoiceId,
            amount: commissionAmount,
            percentage,
          },
        });
      }
    }
  }


}
