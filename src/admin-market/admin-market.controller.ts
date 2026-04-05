import {
  Body,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AdminAreasResponse,
  AdminMarketQaResponse,
  AdminMarketOutlierRow,
  AdminMarketService,
} from './admin-market.service';

@ApiTags('admin-market')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/market')
export class AdminMarketController {
  constructor(private readonly adminMarketService: AdminMarketService) {}

  @Get('qa')
  @ApiOperation({ summary: 'Market data QA summary and outliers (no PII)' })
  @ApiOkResponse({ description: 'Market QA payload' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Admin role is required' })
  @ApiQuery({
    name: 'include_outliers',
    required: false,
    example: false,
    description: 'Include rows already marked as outlier',
  })
  async qa(
    @Query('include_outliers') includeOutliers?: string,
  ): Promise<AdminMarketQaResponse> {
    const include = includeOutliers === 'true' || includeOutliers === '1';
    return this.adminMarketService.getQa(include);
  }

  @Get('areas')
  @ApiOperation({ summary: 'Areas viewer from areas_price' })
  @ApiQuery({ name: 'city', required: false, example: 'damascus' })
  @ApiQuery({ name: 'property_type', required: false, example: 'apartment' })
  @ApiQuery({ name: 'district', required: false, example: 'mazzeh' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiOkResponse({ description: 'Filtered areas_price rows' })
  @ApiBadRequestResponse({ description: 'limit must be an integer between 1 and 200' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Admin role is required' })
  async areas(
    @Query('city') city?: string,
    @Query('property_type') propertyType?: string,
    @Query('district') district?: string,
    @Query('limit') limit?: string,
  ): Promise<AdminAreasResponse[]> {
    const parsedLimit = limit == null || limit === '' ? 50 : Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
      throw new BadRequestException('limit must be an integer between 1 and 200');
    }

    return this.adminMarketService.getAreas({
      city,
      property_type: propertyType,
      district,
      limit: parsedLimit,
    });
  }

  @Post('rebuild-areas')
  @ApiOperation({ summary: 'Rebuild areas_price from market_data within N days' })
  @ApiQuery({ name: 'days', required: false, example: 120 })
  @ApiOkResponse({ description: 'Rebuild summary' })
  @ApiBadRequestResponse({ description: 'days must be an integer between 1 and 3650' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Admin role is required' })
  async rebuildAreas(
    @Query('days') days?: string,
  ): Promise<{
    days: number;
    source_rows: number;
    aggregated_area_keys: number;
    upserted_rows: number;
    skipped_rows: number;
  }> {
    const parsedDays = days == null || days === '' ? 120 : Number(days);
    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 3650) {
      throw new BadRequestException('days must be an integer between 1 and 3650');
    }

    return this.adminMarketService.rebuildAreas(parsedDays);
  }

  @Post('import-csv')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Import market_data from CSV and rebuild areas_price window',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        source: { type: 'string', example: 'import_ui' },
      },
      required: ['file'],
    },
  })
  @ApiQuery({ name: 'days', required: false, example: 120 })
  @ApiOkResponse({ description: 'Import and rebuild summary' })
  @ApiBadRequestResponse({
    description: 'file is required and days must be an integer between 1 and 365',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Admin role is required' })
  async importCsv(
    @UploadedFile() file?: { buffer: Buffer; size: number },
    @Query('days') days?: string,
    @Body('source') source?: string,
  ): Promise<{
    import: {
      inserted: number;
      skipped_duplicates: number;
      invalid: number;
      total_rows: number;
    };
    rebuild: {
      days: number;
      source_rows: number;
      aggregated_area_keys: number;
      upserted_rows: number;
      skipped_rows: number;
    };
  }> {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('file is required');
    }

    const parsedDays = days == null || days === '' ? 120 : Number(days);
    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 365) {
      throw new BadRequestException('days must be an integer between 1 and 365');
    }

    return this.adminMarketService.importCsvAndRebuild({
      fileBuffer: file.buffer,
      days: parsedDays,
      source,
    });
  }

  @Get('outliers')
  @ApiOperation({ summary: 'List market rows with computed outlier reason' })
  @ApiQuery({ name: 'city', required: false, example: 'damascus' })
  @ApiQuery({ name: 'district', required: false, example: 'mazzeh' })
  @ApiQuery({ name: 'type', required: false, example: 'apartment' })
  @ApiQuery({ name: 'limit', required: false, example: 100 })
  @ApiOkResponse({ description: 'Outlier triage rows' })
  @ApiBadRequestResponse({ description: 'limit must be an integer between 1 and 300' })
  async outliers(
    @Query('city') city?: string,
    @Query('district') district?: string,
    @Query('type') propertyType?: string,
    @Query('limit') limit?: string,
  ): Promise<AdminMarketOutlierRow[]> {
    const parsedLimit = limit == null || limit === '' ? 100 : Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 300) {
      throw new BadRequestException('limit must be an integer between 1 and 300');
    }

    return this.adminMarketService.getOutliers({
      city,
      district,
      property_type: propertyType,
      limit: parsedLimit,
    });
  }

  @Post('outliers/mark')
  @ApiOperation({ summary: 'Mark or unmark market_data rows as outliers' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'number' } },
        is_outlier: { type: 'boolean' },
        rebuild_days: { type: 'number', example: 120 },
      },
      required: ['ids', 'is_outlier'],
    },
  })
  @ApiOkResponse({ description: 'Mark/unmark summary with optional rebuild result' })
  @ApiBadRequestResponse({
    description:
      'ids must be a non-empty array of integers and rebuild_days must be 1..3650',
  })
  async markOutliers(
    @Body()
    body?: {
      ids?: number[];
      is_outlier?: boolean;
      rebuild_days?: number;
    },
  ): Promise<{
    updated_rows: number;
    rebuild: null | {
      days: number;
      source_rows: number;
      aggregated_area_keys: number;
      upserted_rows: number;
      skipped_rows: number;
    };
  }> {
    const ids = Array.isArray(body?.ids)
      ? body?.ids.filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (!ids.length) {
      throw new BadRequestException('ids must be a non-empty array of positive integers');
    }
    if (typeof body?.is_outlier !== 'boolean') {
      throw new BadRequestException('is_outlier must be boolean');
    }

    const rebuildDays =
      body?.rebuild_days == null || body.rebuild_days === 0
        ? undefined
        : Number(body.rebuild_days);
    if (
      rebuildDays != null &&
      (!Number.isInteger(rebuildDays) || rebuildDays < 1 || rebuildDays > 3650)
    ) {
      throw new BadRequestException('rebuild_days must be an integer between 1 and 3650');
    }

    return this.adminMarketService.markOutliers({
      ids,
      is_outlier: body.is_outlier,
      rebuild_days: rebuildDays,
    });
  }
}
