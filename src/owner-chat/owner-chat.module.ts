import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AdvisorModule } from '../advisor/advisor.module';
import { ChatModule } from '../chat/chat.module';
import { MarketIntelligenceModule } from '../market-intelligence/market-intelligence.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PropertyModule } from '../property/property.module';
import { PricingModule } from '../pricing/pricing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VocabularyModule } from '../vocabulary/vocabulary.module';
import { OwnerChatController } from './owner-chat.controller';
import { OwnerChatService } from './owner-chat.service';

@Module({
  imports: [
    PrismaModule,
    AdvisorModule,
    PropertyModule,
    AiModule,
    MarketIntelligenceModule,
    ChatModule,
    PricingModule,
    NotificationsModule,
    VocabularyModule,
  ],
  controllers: [OwnerChatController],
  providers: [OwnerChatService],
})
export class OwnerChatModule {}
