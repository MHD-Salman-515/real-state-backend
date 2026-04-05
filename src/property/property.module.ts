import { Module } from '@nestjs/common';
import { PropertyService } from './property.service';
import { PropertyController } from './property.controller';
import { PropertyPublicController } from './property-public.controller';
import { AdminPropertyController } from './admin-property.controller';
import { OwnerStrategyController } from './owner-strategy.controller';
import { OwnerStrategyService } from './owner-strategy.service';
import { OwnerAiHistoryController } from './owner-ai-history.controller';
import { OwnerAiHistoryService } from './owner-ai-history.service';
import { OwnerMarketWatchController } from './owner-market-watch.controller';
import { OwnerMarketWatchService } from './owner-market-watch.service';
import { OwnerPortfolioController } from './owner-portfolio.controller';
import { OwnerPortfolioService } from './owner-portfolio.service';
import { OwnerSuggestionsController } from './owner-suggestions.controller';
import { OwnerSuggestionsService } from './owner-suggestions.service';
import { OwnerPortfolioAnalyzerService } from './owner-portfolio-analyzer.service';
import { OwnerPortfolioAnalyzerController } from './owner-portfolio-analyzer.controller';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthModule } from '../auth/auth.module';
import { UrbanexPrismaModule } from '../prisma/urbanex-prisma.module';
import { AdvisorModule } from '../advisor/advisor.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AuthModule, UrbanexPrismaModule, AdvisorModule, AiModule],
  providers: [
    PropertyService,
    OwnerStrategyService,
    OwnerAiHistoryService,
    OwnerMarketWatchService,
    OwnerPortfolioService,
    OwnerSuggestionsService,
    OwnerPortfolioAnalyzerService,
    RolesGuard,
  ],
  controllers: [
    PropertyController,
    PropertyPublicController,
    AdminPropertyController,
    OwnerStrategyController,
    OwnerAiHistoryController,
    OwnerMarketWatchController,
    OwnerPortfolioController,
    OwnerPortfolioAnalyzerController,
    OwnerSuggestionsController,
  ],
  exports: [
    OwnerStrategyService,
    OwnerSuggestionsService,
    OwnerPortfolioService,
    OwnerAiHistoryService,
  ],
})
export class PropertyModule {}
