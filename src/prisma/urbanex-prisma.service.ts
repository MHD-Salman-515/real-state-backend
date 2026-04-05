import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { loadLocalEnvFiles } from '../config/runtime-env';

@Injectable()
export class UrbanexPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    loadLocalEnvFiles();

    const urbanexDatabaseUrl = process.env.URBANEX_DATABASE_URL;
    if (!urbanexDatabaseUrl) {
      throw new Error(
        'URBANEX_DATABASE_URL is required for UrbanexPrismaService',
      );
    }

    super({
      datasourceUrl: urbanexDatabaseUrl,
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
