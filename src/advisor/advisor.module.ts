import { Module } from '@nestjs/common';
import { AdvisorController } from './advisor.controller';
import { AdvisorService } from './advisor.service';
import { AdvisorExplanationService } from './explanation/advisor-explanation.service';
import { ConfidenceService } from './confidence/confidence.service';
import { AdvisorCacheService } from './cache/advisor-cache.service';
import { ADVISOR_CACHE } from './cache/advisor-cache.port';
import { BuyerEvaluationService } from './buyer-evaluation.service';
import { AdvisorLoggingInterceptor } from './advisor-logging.interceptor';
import { AdvisorRequestLogService } from './advisor-request-log.service';
import { UrbanexPrismaModule } from '../prisma/urbanex-prisma.module';
import { MarketIntelligenceModule } from '../market-intelligence/market-intelligence.module';

@Module({
  imports: [UrbanexPrismaModule, MarketIntelligenceModule],
  controllers: [AdvisorController],
  providers: [
    AdvisorService,
    AdvisorExplanationService,
    ConfidenceService,
    BuyerEvaluationService,
    AdvisorCacheService,
    AdvisorLoggingInterceptor,
    AdvisorRequestLogService,
    {
      provide: ADVISOR_CACHE,
      useExisting: AdvisorCacheService,
    },
  ],
  exports: [AdvisorService, AdvisorRequestLogService],
})
export class AdvisorModule {}
