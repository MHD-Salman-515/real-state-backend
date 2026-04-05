import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MarketDataService } from './market-data.service';

@ApiTags('market-data')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload market_data CSV into housing_db.market_data' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({
    description: 'CSV import summary',
    schema: {
      example: {
        success: true,
        inserted: 2200,
        skipped: 90,
        duplicates: 15,
        invalid: 75,
        invalid_breakdown: {
          missing_city: 10,
          missing_district: 22,
          missing_price_usd: 15,
          invalid_price_usd: 8,
          missing_area_m2: 9,
          invalid_area_m2: 5,
          parsing_failure: 1,
          multiple_missing_fields: 12,
        },
        sample_invalid_rows: [],
      },
    },
  })
  @ApiBadRequestResponse({ description: 'file is required and must contain CSV rows' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Admin role is required' })
  async upload(
    @UploadedFile() file?: { buffer: Buffer; size: number },
  ): Promise<{
    success: true;
    inserted: number;
    skipped: number;
    duplicates: number;
    invalid: number;
    invalid_breakdown: Record<string, number>;
    sample_invalid_rows: Array<Record<string, unknown>>;
  }> {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('file is required');
    }

    return this.marketDataService.importCsv({
      fileBuffer: file.buffer,
    });
  }
}
