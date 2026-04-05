import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { loadLocalEnvFiles } from '../config/runtime-env';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    loadLocalEnvFiles();

    const databaseUrl = String(process.env.DATABASE_URL || '').trim();
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for PrismaService');
    }

    super();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
