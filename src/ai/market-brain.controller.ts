import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { MarketBrainService } from './market-brain.service';

@Controller('ai')
export class MarketBrainController {
  constructor(private readonly marketBrainService: MarketBrainService) {}

  @Get('estimate')
  async estimate(
    @Query('district') district?: string,
    @Query('area_m2') areaM2?: string,
    @Query('property_type') propertyType?: string,
    @Query('condition') condition?: string,
  ) {
    const districtValue = String(district || '').trim();
    if (!districtValue) {
      throw new BadRequestException('district is required');
    }

    const area = Number(areaM2);
    if (!Number.isFinite(area) || area <= 0) {
      throw new BadRequestException('area_m2 must be a positive number');
    }

    const estimate = await this.marketBrainService.estimatePriceRangeSyp({
      district: districtValue,
      area_m2: area,
      property_type: propertyType,
      condition,
    });

    if (!estimate) {
      throw new BadRequestException('No market data available for this district');
    }

    return estimate;
  }
}
