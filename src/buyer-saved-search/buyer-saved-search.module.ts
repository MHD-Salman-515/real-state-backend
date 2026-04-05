import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BuyerSavedSearchController } from './buyer-saved-search.controller';
import { BuyerSavedSearchService } from './buyer-saved-search.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BuyerSavedSearchController],
  providers: [BuyerSavedSearchService],
  exports: [BuyerSavedSearchService],
})
export class BuyerSavedSearchModule {}
