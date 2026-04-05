import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private async fixInvalidUserDateTimes() {
    // Prisma throws (P2020) when MySQL contains invalid "zero" datetimes such as 0000-00-00.
    // Repair only the bad rows so standard Prisma queries can succeed.
    await this.prisma.$executeRawUnsafe(
      "UPDATE `User` SET `createdAt` = NOW(3) WHERE `createdAt` IS NULL OR `createdAt` < '1000-01-01';",
    );
    await this.prisma.$executeRawUnsafe(
      "UPDATE `User` SET `updatedAt` = NOW(3) WHERE `updatedAt` IS NULL OR `updatedAt` < '1000-01-01';",
    );
  }

  async findAll() {
    // Ensure corrupted datetimes don't crash admin pages.
    await this.fixInvalidUserDateTimes();
    return this.prisma.user.findMany();
  }

  findOne(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByRole(role: string) {
    await this.fixInvalidUserDateTimes();
    return this.prisma.user.findMany({
      where: { role: role.toUpperCase() as any },
    });
  }

  async create(data: any) {
    const hashed = await bcrypt.hash(data.password, 10);

    return this.prisma.user.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        password: hashed,
        role: data.role?.toUpperCase(),
        phone: data.phone || null,
      },
    });
  }

  update(id: number, data: any) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  remove(id: number) {
    return this.prisma.user.delete({
      where: { id },
    });
  }
}
