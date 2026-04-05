import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { AdvisorModule } from '../advisor/advisor.module';
import { ChatModule } from '../chat/chat.module';
import { MarketIntelligenceModule } from '../market-intelligence/market-intelligence.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BuyerChatController } from './buyer-chat.controller';
import { BuyerChatService } from './buyer-chat.service';
import { PropertyRankingService } from './ranking/property-ranking.service';

@Module({
  imports: [PrismaModule, AuthModule, MarketIntelligenceModule, AdvisorModule, AiModule, ChatModule],
  controllers: [BuyerChatController],
  providers: [BuyerChatService, PropertyRankingService],
  exports: [BuyerChatService],
})
export class BuyerChatModule {}
