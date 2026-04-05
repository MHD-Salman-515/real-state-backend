import { Module } from '@nestjs/common';
import { UrbanexPrismaService } from './urbanex-prisma.service';

@Module({
  providers: [UrbanexPrismaService],
  exports: [UrbanexPrismaService],
})
export class UrbanexPrismaModule {}
