import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
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
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  OwnerAiHistoryResponse,
  OwnerAiHistoryDetailResponse,
  OwnerAiHistoryService,
} from './owner-ai-history.service';

@ApiTags('owner-ai-history')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
@Controller('owner')
export class OwnerAiHistoryController {
  constructor(private readonly ownerAiHistoryService: OwnerAiHistoryService) {}

  @Get('ai-history')
  @ApiOperation({ summary: 'Owner Urbanex AI history (no PII)' })
  @ApiQuery({
    name: 'days',
    required: false,
    description: 'Window in days (integer 1..365). Defaults to 90.',
    example: 90,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max items to return (integer 1..200). Defaults to 50.',
    example: 50,
  })
  @ApiOkResponse({
    description: 'Owner AI history',
    schema: {
      example: {
        days: 90,
        limit: 50,
        items: [
          {
            log_id: '123',
            endpoint: 'POST /advisor/seller-price',
            city: 'damascus',
            district: 'mazzeh',
            property_type: 'apartment',
            area_m2: 140,
            fx_used: 14000,
            confidence: 0.81,
            created_at: '2026-03-03T11:10:00.000Z',
            outcome: {
              action: 'accepted_fast',
              final_price_syp: '1600000000',
              created_at: '2026-03-03T11:15:00.000Z',
            },
          },
        ],
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'days must be 1..365 and limit must be 1..200',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Owner role is required' })
  async history(
    @Query('days') days?: string,
    @Query('limit') limit?: string,
    @Req() req?: { user?: { sub?: number | string } },
  ): Promise<OwnerAiHistoryResponse> {
    const resolvedDays = days == null || days === '' ? 90 : Number(days);
    const resolvedLimit = limit == null || limit === '' ? 50 : Number(limit);

    if (!Number.isInteger(resolvedDays) || resolvedDays < 1 || resolvedDays > 365) {
      throw new BadRequestException('days must be an integer between 1 and 365');
    }
    if (!Number.isInteger(resolvedLimit) || resolvedLimit < 1 || resolvedLimit > 200) {
      throw new BadRequestException('limit must be an integer between 1 and 200');
    }

    const ownerId = Number(req?.user?.sub);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException('Invalid owner id');
    }

    return this.ownerAiHistoryService.getHistory({
      ownerId,
      days: resolvedDays,
      limit: resolvedLimit,
    });
  }

  @Get('ai-history/:log_id')
  @ApiOperation({ summary: 'Owner AI history details snapshot (no PII)' })
  @ApiOkResponse({
    description: 'Owner AI history details',
    schema: {
      example: {
        log: {
          log_id: '123',
          endpoint: 'POST /advisor/seller-price',
          city: 'damascus',
          district: 'mazzeh',
          property_type: 'apartment',
          area_m2: 140,
          fx_used: 14000,
          confidence: 0.81,
          created_at: '2026-03-03T11:10:00.000Z',
        },
        outcome: {
          action: 'accepted_fast',
          final_price_syp: '1600000000',
          created_at: '2026-03-03T11:15:00.000Z',
        },
        request: {
          city: 'damascus',
          district: 'mazzeh',
          property_type: 'apartment',
          area_m2: 140,
        },
        result: {
          optimal_price_syp: 1798160000,
          fast_sale_price_syp: 1659840000,
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid owner id' })
  @ApiNotFoundResponse({ description: 'AI history item not found' })
  async historyDetail(
    @Param('log_id') logId: string,
    @Req() req?: { user?: { sub?: number | string } },
  ): Promise<OwnerAiHistoryDetailResponse> {
    const ownerId = Number(req?.user?.sub);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException('Invalid owner id');
    }

    return this.ownerAiHistoryService.getHistoryDetail({
      ownerId,
      logId,
    });
  }
}
