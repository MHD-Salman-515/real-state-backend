import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) { }

  create(data) {
    return this.prisma.appointment.create({
      data: {
        clientId: Number(data.clientId),
        propertyId: Number(data.propertyId),
        date: data.date,
        notes: data.notes || "",
        status: data.status || "PENDING",
      }
    });
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

  update(id: number, data) {
    return this.prisma.appointment.update({
      where: { id },
      data,
    });
  }

  delete(id: number) {
    return this.prisma.appointment.delete({
      where: { id },
    });
  }
}
