import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
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
import { CreateExternalMarketObservationDto } from './dto/create-external-market-observation.dto';
import { CreateExternalMarketSourceDto } from './dto/create-external-market-source.dto';
import { ImportExternalMarketCsvDto } from './dto/import-external-market-csv.dto';
import { RebuildExternalBaselineDto } from './dto/rebuild-external-baseline.dto';
import { AdminExternalMarketService } from './admin-external-market.service';

@ApiTags('admin-external-market')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/external-market')
export class AdminExternalMarketController {
  constructor(private readonly service: AdminExternalMarketService) {}

  @Post('sources')
  @ApiOperation({ summary: 'Create external market source' })
  @ApiOkResponse({ description: 'Created source' })
  @ApiBadRequestResponse({ description: 'Invalid source payload' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Admin role is required' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createSource(@Body() dto: CreateExternalMarketSourceDto) {
    return this.service.createSource(dto);
  }

  @Get('sources')
  @ApiOperation({ summary: 'List external market sources' })
  @ApiOkResponse({ description: 'Sources list' })
  async listSources() {
    return this.service.listSources();
  }

  @Post('observations')
  @ApiOperation({ summary: 'Create one external market observation (deduplicated by ingest_hash)' })
  @ApiOkResponse({ description: 'Observation insert status' })
  @ApiBadRequestResponse({ description: 'Invalid observation payload' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createObservation(@Body() dto: CreateExternalMarketObservationDto) {
    return this.service.createObservation(dto);
  }

  @Post('import-csv')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Import external observations from CSV and rebuild baseline index' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        source_id: { type: 'number', example: 1 },
        metric: { type: 'string', example: 'price_per_m2_syp' },
        value_unit: { type: 'string', example: 'SYP_PER_M2' },
        months_window: { type: 'number', example: 12 },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({ description: 'Import + rebuild summary' })
  @ApiBadRequestResponse({ description: 'file is required and CSV rows must be valid' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async importCsv(
    @UploadedFile() file?: { buffer: Buffer },
    @Body() body?: ImportExternalMarketCsvDto,
  ) {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('file is required');
    }

    return this.service.importCsv({
      fileBuffer: file.buffer,
      sourceId: body?.source_id,
      metric: body?.metric,
      valueUnit: body?.value_unit,
      monthsWindow: body?.months_window,
    });
  }

  @Post('rebuild-baseline')
  @ApiOperation({ summary: 'Rebuild external baseline index from latest 6-12 months' })
  @ApiOkResponse({ description: 'Rebuild summary' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async rebuildBaseline(@Body() dto: RebuildExternalBaselineDto) {
    return this.service.rebuildBaseline({ monthsWindow: dto.months_window });
  }

  @Get('baseline')
  @ApiOperation({ summary: 'Get external baseline index rows by optional area filters' })
  @ApiQuery({ name: 'city', required: false, example: 'damascus' })
  @ApiQuery({ name: 'district', required: false, example: 'mazzeh' })
  @ApiQuery({ name: 'propertyType', required: false, example: 'apartment' })
  @ApiOkResponse({ description: 'Baseline rows' })
  async baseline(
    @Query('city') city?: string,
    @Query('district') district?: string,
    @Query('propertyType') propertyType?: string,
  ) {
    return this.service.getBaseline({
      city,
      district,
      propertyType,
    });
  }
}
