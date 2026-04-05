import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) { }

  // ---------------------- CREATE ----------------------
  async create(dto: any, creatorId: number) {
    let dueDate: Date | null = null;

    // معالجة تاريخ الاستحقاق إن وجد
    if (dto.dueDate) {
      const parsed = new Date(dto.dueDate);

      // ضمان أن التاريخ صحيح
      if (!isNaN(parsed.getTime())) {
        dueDate = parsed;
      } else {
        throw new Error("Invalid dueDate format — must be valid date (YYYY-MM-DD).");
      }
    }

    return this.prisma.invoice.create({
      data: {
        clientId: dto.clientId,
        propertyId: dto.propertyId,
        type: dto.type,
        totalAmount: dto.totalAmount,
        tax: dto.tax ?? 0,
        dueDate: dueDate, // Prisma يقبل Null أو Date
        createdBy: creatorId,
      },
    });
  }



  // ---------------------- FIND ALL ----------------------
  findAll() {
    return this.prisma.invoice.findMany({
      include: {
        client: true,
        property: true,
      },
    });
  }

  // ---------------------- REMOVE ----------------------
  remove(id: number, userId: number) {
    return this.prisma.invoice.delete({
      where: { id },
    });
  }


  // ---------------------- SUPPLIER INVOICES FROM EXPENSES ----------------------
  async getSupplierInvoices(supplierId: number) {
    return this.prisma.invoice.findMany({
      where: {
        type: "SERVICE",
        expenses: {
          some: {
            contractorId: supplierId   // ✔ الصحيح
          }
        }
      },
      include: {
        property: true,
        expenses: {
          include: {
            contractor: true,
            ticket: {
              include: {
                property: true
              }
            }
          }
        }
      },
      orderBy: {
        id: "desc"
      }
    });
  }

  // ============================
  // GET ALL SUPPLIER INVOICES (no filter)
  // ============================
  async getAllSupplierInvoices() {
    return this.prisma.invoice.findMany({
      where: {
        type: "SERVICE",
        expenses: { some: {} }
      },
      include: {
        property: true,
        expenses: {
          include: {
            contractor: true,
            ticket: {
              include: { property: true }
            }
          }
        }
      },
      orderBy: { id: "desc" }
    });
  }

}
