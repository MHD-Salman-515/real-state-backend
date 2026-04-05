import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketDataController } from './market-data.controller';
import { MarketDataImportDiagnosticsService } from './market-data-import-diagnostics.service';
import { MarketDataService } from './market-data.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MarketDataController],
  providers: [MarketDataService, MarketDataImportDiagnosticsService],
  exports: [MarketDataService],
})
export class MarketDataModule {}
