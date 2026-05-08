import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async create(data) {
    const appointment = await this.prisma.appointment.create({
      data: {
        clientId: Number(data.clientId),
        propertyId: Number(data.propertyId),
        date: data.date,
        notes: data.notes || "",
        status: data.status || "PENDING",
      }
    });

    try {
      const property = await this.prisma.property.findUnique({
        where: { id: appointment.propertyId },
        select: { ownerId: true },
      });
      if (property && this.notifications) {
        await this.notifications.create({
          userId: property.ownerId,
          type: 'APPOINTMENT_BOOKED',
          title: 'طلب زيارة جديد',
          body: 'لديك طلب زيارة جديد لعقارك. تحقق من المواعيد.',
          sendEmail: true,
          emailSubject: 'طلب زيارة جديد',
          emailHtml: '<p>لديك طلب زيارة جديد لعقارك. تحقق من المواعيد.</p>',
        });
      }
    } catch {}

    return appointment;
  }

  // 🔥 إرجاع كل المواعيد للعميل
  findAll() {
    return this.prisma.appointment.findMany({
      include: {
        client: true,
        property: true,
      },
    });
  }

  findOne(id: number) {
    return this.prisma.appointment.findUnique({
      where: { id },
      include: {
        client: true,
        property: true,
      },
    });
  }

  async update(id: number, data) {
    const updated = await this.prisma.appointment.update({
      where: { id },
      data,
    });

    if (this.notifications && (data.status === 'CONFIRMED' || data.status === 'CANCELLED')) {
      try {
        if (data.status === 'CONFIRMED') {
          await this.notifications.create({
            userId: updated.clientId,
            type: 'APPOINTMENT_CONFIRMED',
            title: 'تم تأكيد موعد زيارتك',
            body: 'تم تأكيد موعد زيارتك بنجاح. نتطلع لرؤيتك!',
            sendEmail: true,
            emailSubject: 'تأكيد موعد الزيارة',
            emailHtml: '<p>تم تأكيد موعد زيارتك بنجاح. نتطلع لرؤيتك!</p>',
          });
        } else {
          await this.notifications.create({
            userId: updated.clientId,
            type: 'APPOINTMENT_CANCELLED',
            title: 'تم إلغاء موعد الزيارة',
            body: 'للأسف تم إلغاء موعد زيارتك. يمكنك حجز موعد آخر.',
            sendEmail: true,
            emailSubject: 'إلغاء موعد الزيارة',
            emailHtml: '<p>للأسف تم إلغاء موعد زيارتك. يمكنك حجز موعد آخر.</p>',
          });
        }
      } catch {}
    }

    return updated;
  }

  delete(id: number) {
    return this.prisma.appointment.delete({
      where: { id },
    });
  }
}
