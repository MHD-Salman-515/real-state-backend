import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OwnerStrategyService } from './owner-strategy.service';

@ApiTags('owner-strategy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
@Controller('owner/properties')
export class OwnerStrategyController {
  constructor(private readonly ownerStrategyService: OwnerStrategyService) {}

  @Get(':id/strategy')
  @ApiOperation({ summary: 'Owner Strategy Center package for a published property' })
  @ApiQuery({
    name: 'days_window',
    required: false,
    example: 90,
    description: 'Window in days (1..365). Defaults to 90.',
  })
  @ApiOkResponse({
    description: 'Strategy package response',
    schema: {
      example: {
        property: {
          id: 25,
          city: 'damascus',
          address: 'المزة',
          type: 'APARTMENT',
          area: 140,
          price: 1800000000,
        },
        strategy_log_id: '12345',
        seller: {
          optimal_price_syp: 1760000000,
          fast_sale_price_syp: 1680000000,
          confidence: 0.79,
        },
        insights: {
          sample_count: 120,
          stats: {
            median_ppm2_syp: 12400000,
            volatility_index: 0.14,
            trend_last_30_days: { direction: 'up', change_ratio: 0.03 },
          },
        },
        simulation: {
          deviation_percent: 2.3,
          risk_score: 0.18,
          sale_speed_class: 'normal',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Property must be valid with positive price/area and days_window must be 1..365',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Owner access only for owned properties' })
  async strategy(
    @Param('id') id: string,
    @Query('days_window') daysWindow?: string,
    @Req() req?: { user?: { sub?: number; role?: string } },
  ) {
    const propertyId = Number(id);
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      throw new BadRequestException('Property id must be a positive integer');
    }

    const resolvedDays = daysWindow == null || daysWindow === '' ? 90 : Number(daysWindow);
    if (!Number.isInteger(resolvedDays) || resolvedDays < 1 || resolvedDays > 365) {
      throw new BadRequestException('days_window must be an integer between 1 and 365');
    }

    return this.ownerStrategyService.getStrategy({
      propertyId,
      requester: req?.user || {},
      daysWindow: resolvedDays,
    });
  }

  @Patch(':id/price')
  @ApiOperation({ summary: 'Update only owner property price' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        price: { type: 'number', example: 1700000000 },
      },
      required: ['price'],
    },
  })
  @ApiOkResponse({
    description: 'Updated property price',
    schema: { example: { id: 25, price: 1700000000 } },
  })
  async updatePrice(
    @Param('id') id: string,
    @Body('price') price?: number,
    @Req() req?: { user?: { sub?: number; role?: string } },
  ) {
    const propertyId = Number(id);
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      throw new BadRequestException('Property id must be a positive integer');
    }
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      throw new BadRequestException('price must be greater than 0');
    }

    return this.ownerStrategyService.updateOwnerPropertyPrice({
      propertyId,
      requester: req?.user || {},
      price: parsedPrice,
    });
  }
}
