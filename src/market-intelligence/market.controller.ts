import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { MarketStatsService } from './market-stats.service';

@ApiTags('market')
@Controller('market')
export class MarketController {
  constructor(private readonly marketStatsService: MarketStatsService) {}

  @Get('heatmap')
  @ApiOperation({ summary: 'Get district-level market heatmap for a city' })
  @ApiQuery({ name: 'city', required: true, example: 'دمشق' })
  @ApiOkResponse({
    description: 'District heatmap stats',
    schema: {
      example: {
        city: 'damascus',
        districts: [
          {
            district: 'mazzeh',
            properties_count: 120,
            avg_price_per_m2: 1100,
            median_price_per_m2: 1080,
            min_price_per_m2: 760,
            max_price_per_m2: 1450,
            market_status: 'HOT',
          },
        ],
      },
    },
  })
  @ApiBadRequestResponse({ description: 'city is required' })
  async heatmap(@Query('city') city?: string) {
    if (!city || !city.trim()) {
      throw new BadRequestException('city is required');
    }

    return this.marketStatsService.getHeatmap(city.trim());
  }
}
