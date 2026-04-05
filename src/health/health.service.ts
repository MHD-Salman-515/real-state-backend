import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UrbanexPrismaService } from '../prisma/urbanex-prisma.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly urbanexPrisma: UrbanexPrismaService,
  ) {}

  async getHousingDbStatus(): Promise<'ok' | 'fail'> {
    try {
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
      return 'ok';
    } catch {
      return 'fail';
    }
  }

  async getUrbanexDbStatus(): Promise<'ok' | 'fail'> {
    try {
      await this.urbanexPrisma.$queryRaw(Prisma.sql`SELECT 1`);
      return 'ok';
    } catch {
      return 'fail';
    }
  }
}
