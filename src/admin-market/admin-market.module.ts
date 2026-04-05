import { Module } from '@nestjs/common';
import { ConfidenceService } from '../advisor/confidence/confidence.service';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UrbanexPrismaModule } from '../prisma/urbanex-prisma.module';
import { AdminMarketController } from './admin-market.controller';
import { AdminMarketService } from './admin-market.service';

@Module({
  imports: [AuthModule, UrbanexPrismaModule],
  controllers: [AdminMarketController],
  providers: [AdminMarketService, RolesGuard, ConfidenceService],
})
export class AdminMarketModule {}
