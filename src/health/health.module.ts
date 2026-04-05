import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { UrbanexPrismaModule } from '../prisma/urbanex-prisma.module';

@Module({
  imports: [UrbanexPrismaModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
