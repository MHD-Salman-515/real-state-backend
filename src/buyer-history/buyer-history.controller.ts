import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
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
import { BuyerHistoryService } from './buyer-history.service';
import type { Response } from 'express';

@ApiTags('buyer-history')
@Controller()
export class BuyerHistoryController {
  constructor(private readonly buyerHistoryService: BuyerHistoryService) {}

  @Get('buyer/history')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENT')
  @ApiOperation({ summary: 'Get buyer recommendation history for current buyer' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiOkResponse({ description: 'Buyer recommendation logs list' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Buyer role is required' })
  async list(
    @Query('limit') limit?: string,
    @Req() req?: { user?: { sub?: string | number } },
  ) {
    const buyerId = this.getUserId(req);
    const safeLimit = limit == null || limit === '' ? 50 : Number(limit);
    return this.buyerHistoryService.listBuyerHistory({
      buyerId,
      limit: safeLimit,
    });
  }

  @Get('buyer/history/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENT')
  @ApiOperation({ summary: 'Get buyer recommendation log by id (owner-only)' })
  @ApiOkResponse({ description: 'Buyer recommendation log details' })
  async getOne(
    @Param('id') id: string,
    @Req() req?: { user?: { sub?: string | number } },
  ) {
    const buyerId = this.getUserId(req);
    const logId = Number(id);
    if (!Number.isInteger(logId) || logId <= 0) {
      throw new BadRequestException('id must be a positive integer');
    }

    return this.buyerHistoryService.getBuyerHistoryById({ buyerId, id: logId });
  }

  @Get('admin/buyer/history/export')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Export buyer recommendation history for admin (json/csv)' })
  @ApiQuery({ name: 'format', required: false, example: 'json' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiOkResponse({ description: 'Export payload as JSON or CSV' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Admin role is required' })
  async exportHistory(
    @Query('format') format?: string,
    @Query('days') days?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const safeFormat = String(format || 'json').toLowerCase() === 'csv' ? 'csv' : 'json';
    const safeDays = days == null || days === '' ? 30 : Number(days);

    const result = await this.buyerHistoryService.exportHistory({
      format: safeFormat,
      days: safeDays,
    });

    if (safeFormat === 'csv') {
      res?.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res?.setHeader(
        'Content-Disposition',
        `attachment; filename="buyer-history-export-${safeDays}d.csv"`,
      );
      return result;
    }

    return result;
  }

  private getUserId(req?: { user?: { sub?: string | number } }) {
    const id = Number(req?.user?.sub);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid user id');
    }
    return id;
  }
}
