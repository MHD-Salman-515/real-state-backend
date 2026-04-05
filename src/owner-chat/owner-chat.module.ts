import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AdvisorModule } from '../advisor/advisor.module';
import { ChatModule } from '../chat/chat.module';
import { MarketIntelligenceModule } from '../market-intelligence/market-intelligence.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PropertyModule } from '../property/property.module';
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
  ],
  controllers: [OwnerChatController],
  providers: [OwnerChatService],
})
export class OwnerChatModule {}
