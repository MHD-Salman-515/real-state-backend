import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { MarketSnapshotService } from './market-snapshot.service';
import { MarketTrendService } from './market-trend.service';

@ApiTags('market-intelligence')
@Controller()
export class MarketIntelligenceController {
  constructor(
    private readonly marketSnapshotService: MarketSnapshotService,
    private readonly marketTrendService: MarketTrendService,
  ) {}

  @Post('admin/market/rebuild-snapshots')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Rebuild daily market snapshots from market_data (non-outliers only)' })
  @ApiOkResponse({ description: 'Rebuild summary' })
  @ApiBadRequestResponse({ description: 'days must be an integer between 1 and 3650' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Admin role is required' })
  async rebuildSnapshots(@Body() body?: { days?: number }) {
    const days = body?.days == null ? 365 : Number(body.days);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new BadRequestException('days must be an integer between 1 and 3650');
    }

    return this.marketSnapshotService.rebuildSnapshots(days);
  }

  @Get('market/trends')
  @ApiOperation({ summary: 'Get market trend by city/district/property_type from snapshot table' })
  @ApiQuery({ name: 'city', required: true, example: 'damascus' })
  @ApiQuery({ name: 'district', required: true, example: 'mazzeh' })
  @ApiQuery({ name: 'property_type', required: true, example: 'apartment' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  async getTrends(
    @Query('city') city?: string,
    @Query('district') district?: string,
    @Query('property_type') propertyType?: string,
    @Query('days') days?: string,
  ) {
    if (!city || !district || !propertyType) {
      throw new BadRequestException('city, district and property_type are required');
    }

    return this.marketTrendService.getTrend({
      city,
      district,
      property_type: propertyType,
      days: days == null || days === '' ? 30 : Number(days),
    });
  }
}
