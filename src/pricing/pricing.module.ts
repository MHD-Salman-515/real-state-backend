import { Module } from '@nestjs/common';
import { PricingFactorsService } from './pricing-factors.service';

@Module({
  providers: [PricingFactorsService],
  exports: [PricingFactorsService],
})
export class PricingModule {}
