import { Module } from '@nestjs/common';
import { UrbanexPrismaModule } from '../prisma/urbanex-prisma.module';
import { AdminExternalMarketController } from './admin-external-market.controller';
import { AdminExternalMarketService } from './admin-external-market.service';

@Module({
  imports: [UrbanexPrismaModule],
  controllers: [AdminExternalMarketController],
  providers: [AdminExternalMarketService],
  exports: [AdminExternalMarketService],
})
export class AdminExternalMarketModule {}
