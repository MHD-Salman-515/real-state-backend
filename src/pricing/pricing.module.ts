import { Module } from '@nestjs/common';
import { PricingFactorsService } from './pricing-factors.service';
import { LocationServicesService } from './location-services.service';

@Module({
  providers: [PricingFactorsService, LocationServicesService],
  exports: [PricingFactorsService, LocationServicesService],
})
export class PricingModule {}
