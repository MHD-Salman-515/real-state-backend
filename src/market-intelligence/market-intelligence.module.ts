import { Module } from '@nestjs/common';
import { UrbanexPrismaModule } from '../prisma/urbanex-prisma.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketController } from './market.controller';
import { MarketIntelligenceController } from './market-intelligence.controller';
import { ComparableEngineService } from './comparable-engine.service';
import { MarketPricingService } from './market-pricing.service';
import { MarketSnapshotService } from './market-snapshot.service';
import { MarketStatsService } from './market-stats.service';
import { MarketTrendService } from './market-trend.service';

@Module({
  imports: [UrbanexPrismaModule, PrismaModule],
  controllers: [MarketIntelligenceController, MarketController],
  providers: [
    MarketSnapshotService,
    MarketTrendService,
    ComparableEngineService,
    MarketPricingService,
    MarketStatsService,
  ],
  exports: [
    MarketSnapshotService,
    MarketTrendService,
    ComparableEngineService,
    MarketPricingService,
    MarketStatsService,
  ],
})
export class MarketIntelligenceModule {}
