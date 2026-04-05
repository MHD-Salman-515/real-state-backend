import {
  BadRequestException,
  Controller,
  Get,
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
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OwnerSuggestionsService } from './owner-suggestions.service';

@ApiTags('owner-suggestions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
@Controller('owner')
export class OwnerSuggestionsController {
  constructor(private readonly ownerSuggestionsService: OwnerSuggestionsService) {}

  @Get('suggestions')
  @ApiOperation({ summary: 'Owner suggestions queue (deterministic)' })
  @ApiQuery({
    name: 'days_window',
    required: false,
    description: 'Window in days (integer 1..365). Defaults to 90.',
    example: 90,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max properties (integer 1..100). Defaults to 50.',
    example: 50,
  })
  @ApiOkResponse({
    description: 'Owner suggestions queue',
    schema: {
      example: {
        days_window: 90,
        items: [
          {
            property: {
              id: 10,
              title: 'شقة بالمزة',
              city: 'damascus',
              address: 'mazzeh',
              type: 'APARTMENT',
              area: 140,
              price: 1750000000,
            },
            priority: { score: 0.78, label: 'sell_now' },
            action: {
              code: 'apply_fast',
              title_ar: 'غيّر السعر الآن',
              description_ar: 'اعتماد سعر البيع السريع يرفع احتمالية إغلاق أسرع.',
              recommended_price_syp: 1659840000,
            },
            reasons_ar: ['تذبذب عالي بالسوق'],
            log_id: '9912',
          },
        ],
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'days_window must be 1..365 and limit must be 1..100',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Owner role is required' })
  async suggestions(
    @Query('days_window') daysWindow?: string,
    @Query('limit') limit?: string,
    @Req() req?: { user?: { sub?: number | string } },
  ): Promise<unknown> {
    const resolvedDays = daysWindow == null || daysWindow === '' ? 90 : Number(daysWindow);
    const resolvedLimit = limit == null || limit === '' ? 50 : Number(limit);

    if (!Number.isInteger(resolvedDays) || resolvedDays < 1 || resolvedDays > 365) {
      throw new BadRequestException('days_window must be an integer between 1 and 365');
    }
    if (!Number.isInteger(resolvedLimit) || resolvedLimit < 1 || resolvedLimit > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100');
    }

    const ownerId = Number(req?.user?.sub);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException('Invalid owner id');
    }

    return this.ownerSuggestionsService.getSuggestions({
      ownerId,
      daysWindow: resolvedDays,
      limit: resolvedLimit,
    });
  }
}
