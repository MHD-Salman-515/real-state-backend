import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiService } from './ai.service';
import { RagService } from './rag.service';
import { AiController } from './ai.controller';
import { MarketBrainService } from './market-brain.service';
import { MarketBrainController } from './market-brain.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AiController, MarketBrainController],
  providers: [AiService, RagService, MarketBrainService],
  exports: [AiService, RagService, MarketBrainService],
})
export class AiModule {}
