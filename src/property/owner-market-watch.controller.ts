import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
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
import { OwnerMarketWatchService } from './owner-market-watch.service';

@ApiTags('owner-market-watch')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
@Controller('owner/market-watch')
export class OwnerMarketWatchController {
  constructor(private readonly ownerMarketWatchService: OwnerMarketWatchService) {}

  @Get('insights')
  @ApiOperation({ summary: 'Owner market insights (deterministic, non-outliers only)' })
  @ApiQuery({ name: 'city', required: true, example: 'damascus' })
  @ApiQuery({ name: 'district', required: false, example: 'mazzeh' })
  @ApiQuery({ name: 'property_type', required: false, example: 'apartment' })
  @ApiQuery({ name: 'days_window', required: false, example: 90 })
  @ApiOkResponse({ description: 'Insights response for owner market watch' })
  async insights(
    @Query('city') city?: string,
    @Query('district') district?: string,
    @Query('property_type') propertyType?: string,
    @Query('days_window') daysWindow?: string,
  ) {
    const resolvedDays = daysWindow == null || daysWindow === '' ? 90 : Number(daysWindow);
    if (!Number.isInteger(resolvedDays) || resolvedDays < 1 || resolvedDays > 365) {
      throw new BadRequestException('days_window must be an integer between 1 and 365');
    }

    return this.ownerMarketWatchService.getInsights({
      city: String(city || ''),
      district,
      property_type: propertyType,
      days_window: resolvedDays,
    });
  }

  @Get('list')
  @ApiOperation({ summary: 'List owner market watch items' })
  @ApiOkResponse({ description: 'Watchlist items' })
  async list(@Req() req?: { user?: { sub?: number | string } }) {
    const ownerId = this.getOwnerId(req);
    return this.ownerMarketWatchService.list(ownerId);
  }

  @Post()
  @ApiOperation({ summary: 'Create/update owner market watch item' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['city', 'district', 'property_type'],
      properties: {
        city: { type: 'string', example: 'damascus' },
        district: { type: 'string', example: 'mazzeh' },
        property_type: { type: 'string', example: 'apartment' },
        days_window: { type: 'number', example: 90 },
      },
    },
  })
  @ApiOkResponse({ description: 'Created or updated watch item' })
  @ApiBadRequestResponse({ description: 'city/district/property_type required and days_window 1..365' })
  async create(
    @Body()
    body?: {
      city?: string;
      district?: string;
      property_type?: string;
      days_window?: number;
    },
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    const ownerId = this.getOwnerId(req);
    const resolvedDays =
      body?.days_window == null ? 90 : Number(body.days_window);
    if (!Number.isInteger(resolvedDays) || resolvedDays < 1 || resolvedDays > 365) {
      throw new BadRequestException('days_window must be an integer between 1 and 365');
    }

    return this.ownerMarketWatchService.create({
      ownerId,
      city: String(body?.city || ''),
      district: String(body?.district || ''),
      property_type: String(body?.property_type || ''),
      days_window: resolvedDays,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete owner market watch item' })
  @ApiOkResponse({ description: 'Delete status' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Owner role is required' })
  async remove(
    @Param('id') id: string,
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    const ownerId = this.getOwnerId(req);
    const watchId = Number(id);
    if (!Number.isInteger(watchId) || watchId <= 0) {
      throw new BadRequestException('id must be a positive integer');
    }

    return this.ownerMarketWatchService.remove({
      ownerId,
      id: watchId,
    });
  }

  private getOwnerId(req?: { user?: { sub?: number | string } }): number {
    const ownerId = Number(req?.user?.sub);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException('Invalid owner id');
    }
    return ownerId;
  }
}
