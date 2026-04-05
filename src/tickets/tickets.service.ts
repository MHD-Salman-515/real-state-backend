import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStatus, TicketPriority } from '@prisma/client';

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  // إنشاء تذكرة جديدة (Client)
  async create(data: any, clientId: number) {
    const cleanData = {
      propertyId: Number(data.propertyId),
      category: String(data.category),
      description: String(data.description),
      priority: (data.priority as TicketPriority) || 'MEDIUM',
      clientId: Number(clientId),
      // status رح ياخذ default OPEN من السكيما
    };

    const ticket = await this.prisma.maintenanceTicket.create({
      data: cleanData,
    });

    await this.addLog(ticket.id, cleanData.clientId, 'Ticket created');
    return ticket;
  }

  // تذاكر العميل الحالي
  async getMyTickets(clientId: number) {
    return this.prisma.maintenanceTicket.findMany({
      where: { clientId },
      include: {
        property: true,
        client: true,
        worker: true,
        supplier: true,
        logs: {
          orderBy: { actionDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // جميع التذاكر (Admin)
  async findAll() {
    return this.prisma.maintenanceTicket.findMany({
      include: {
        property: true,
        client: true,
        worker: true,
        supplier: true,
        logs: {
          orderBy: { actionDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // تذاكر العامل المسندة له
  async getAssignedTo(workerId: number) {
    return this.prisma.maintenanceTicket.findMany({
      where: { assignedTo: workerId },
      include: {
        property: true,
        client: true,
        worker: true,
        supplier: true,
        logs: {
          orderBy: { actionDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // تذاكر المورّد الحالي
  async getForSupplier(supplierId: number) {
    return this.prisma.maintenanceTicket.findMany({
      where: { supplierId },
      include: {
        property: true,
        client: true,
        worker: true,
        supplier: true,
        logs: {
          orderBy: { actionDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // جلب تذكرة واحدة
  async findOne(id: number) {
    const ticket = await this.prisma.maintenanceTicket.findUnique({
      where: { id: Number(id) },
      include: {
        property: true,
        client: true,
        worker: true,
        supplier: true,
        logs: {
          orderBy: { actionDate: 'desc' },
        },
      },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  // تحديث التذكرة
  async update(id: number, data: any, userId: number) {
    const ticket = await this.prisma.maintenanceTicket.update({
      where: { id: Number(id) },
      data: {
        // حماية بسيطة + تنظيف types
        propertyId: data.propertyId !== undefined ? Number(data.propertyId) : undefined,
        category: data.category !== undefined ? String(data.category) : undefined,
        description: data.description !== undefined ? String(data.description) : undefined,
        priority: data.priority !== undefined ? (data.priority as TicketPriority) : undefined,
        status: data.status !== undefined ? (data.status as TicketStatus) : undefined,
        assignedTo: data.assignedTo !== undefined ? Number(data.assignedTo) : undefined,
        supplierId: data.supplierId !== undefined ? Number(data.supplierId) : undefined,
      },
    });

    await this.addLog(id, userId, 'Ticket updated');
    return ticket;
  }

  // حذف التذكرة + اللوجات المرتبطة بها
  async delete(id: number) {
    const ticketId = Number(id);

    return this.prisma.$transaction(async (tx) => {
      // 1) احذف كل الـ Logs المرتبطة بالتذكرة
      // ملاحظة: حسب db pull، الـ delegate غالباً اسمه ticketlog (مش ticketLog)
      await tx.ticketlog.deleteMany({
        where: { ticketId },
      });

      // 2) احذف التذكرة
      await tx.maintenanceTicket.delete({
        where: { id: ticketId },
      });

      return { message: 'Ticket deleted successfully', id: ticketId };
    });
  }

  // تعيين العامل
  async assignWorker(ticketId: number, workerId: number, userId: number) {
    await this.prisma.maintenanceTicket.update({
      where: { id: Number(ticketId) },
      data: { assignedTo: Number(workerId) },
    });

    await this.addLog(ticketId, userId, `Worker #${workerId} assigned`);
    return { message: 'Worker assigned successfully' };
  }

  // تعيين مورّد
  async assignSupplier(ticketId: number, supplierId: number, userId: number) {
    await this.prisma.maintenanceTicket.update({
      where: { id: Number(ticketId) },
      data: { supplierId: Number(supplierId) },
    });

    await this.addLog(ticketId, userId, `Supplier #${supplierId} assigned`);
    return { message: 'Supplier assigned successfully' };
  }

  // تحديث حالة التذكرة
  async updateStatus(id: number, status: TicketStatus, userId: number) {
    const ticket = await this.prisma.maintenanceTicket.update({
      where: { id: Number(id) },
      data: { status },
    });

    await this.addLog(id, userId, `Status changed to ${status}`);
    return ticket;
  }

  // إضافة Log مع حماية من مشاكل الـ FK
  async addLog(
    ticketId: number,
    userId: number | null | undefined,
    action: string,
  ) {
    try {
      if (!userId) return;

      // تأكد المستخدم موجود
      const user = await this.prisma.user.findUnique({
        where: { id: Number(userId) },
        select: { id: true },
      });
      if (!user) return;

      // تأكد التذكرة موجودة
      const ticket = await this.prisma.maintenanceTicket.findUnique({
        where: { id: Number(ticketId) },
        select: { id: true },
      });
      if (!ticket) return;

      // إنشاء اللوج (delegate حسب db pull هو ticketlog)
      return await this.prisma.ticketlog.create({
        data: {
          ticketId: Number(ticketId),
          userId: Number(userId),
          action: String(action),
        },
      });
    } catch (err) {
      console.error('❌ addLog failed', err);
      return;
    }
  }
}