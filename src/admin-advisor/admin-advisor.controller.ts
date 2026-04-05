import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AdminAdvisorAnalyticsResponse,
  AdminAdvisorService,
} from './admin-advisor.service';

@ApiTags('admin-advisor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/advisor')
export class AdminAdvisorController {
  constructor(private readonly adminAdvisorService: AdminAdvisorService) {}

  @Get('analytics')
  @ApiOperation({ summary: 'Admin advisor analytics (no PII)' })
  @ApiQuery({
    name: 'days',
    required: false,
    description: 'Window in days (integer 1..90). Defaults to 7.',
    example: 7,
  })
  @ApiOkResponse({
    description: 'Aggregated advisor analytics for admin',
    schema: {
      example: {
        days: 7,
        totals: {
          suggestions: 128,
          accepted_optimal: 20,
          accepted_fast: 9,
          edited: 14,
          ignored: 6,
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'days must be an integer between 1 and 90' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Admin role is required' })
  async analytics(
    @Query('days') days?: string,
  ): Promise<AdminAdvisorAnalyticsResponse> {
    const resolvedDays = days == null || days === '' ? 7 : Number(days);
    if (!Number.isInteger(resolvedDays) || resolvedDays < 1 || resolvedDays > 90) {
      throw new BadRequestException('days must be an integer between 1 and 90');
    }

    return this.adminAdvisorService.getAnalytics(resolvedDays);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export advisor interactions (no PII)' })
  @ApiQuery({
    name: 'days',
    required: false,
    description: 'Window in days (integer 1..365). Defaults to 90.',
    example: 90,
  })
  @ApiQuery({
    name: 'format',
    required: false,
    description: 'Export format: json | csv. Defaults to json.',
    example: 'json',
  })
  @ApiProduces('application/json', 'text/csv')
  @ApiOkResponse({ description: 'Advisor export payload' })
  @ApiBadRequestResponse({
    description: 'days must be an integer between 1 and 365 and format must be json or csv',
  })
  async exportData(
    @Query('days') days?: string,
    @Query('format') format?: string,
    @Res() res?: Response,
  ) {
    const resolvedDays = days == null || days === '' ? 90 : Number(days);
    if (!Number.isInteger(resolvedDays) || resolvedDays < 1 || resolvedDays > 365) {
      throw new BadRequestException('days must be an integer between 1 and 365');
    }

    const normalizedFormat = (format ?? 'json').toLowerCase();
    if (normalizedFormat !== 'json' && normalizedFormat !== 'csv') {
      throw new BadRequestException('format must be json or csv');
    }

    const rows = await this.adminAdvisorService.getExport(resolvedDays);
    if (normalizedFormat === 'csv') {
      const csv = this.adminAdvisorService.toCsv(rows);
      const now = new Date().toISOString().slice(0, 10);
      res?.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res?.setHeader(
        'Content-Disposition',
        `attachment; filename="advisor-export-${now}.csv"`,
      );
      return res?.send(csv);
    }

    return res?.json({ days: resolvedDays, rows });
  }
}
