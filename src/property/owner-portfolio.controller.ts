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
import { OwnerPortfolioService } from './owner-portfolio.service';

@ApiTags('owner-portfolio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
@Controller('owner')
export class OwnerPortfolioController {
  constructor(private readonly ownerPortfolioService: OwnerPortfolioService) {}

  @Get('portfolio')
  @ApiOperation({ summary: 'Owner portfolio intelligence (deterministic)' })
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
    description: 'Portfolio intelligence payload',
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
              updated_at: '2026-03-03T10:00:00.000Z',
              created_at: '2026-02-20T10:00:00.000Z',
            },
            ai: {
              seller: { optimal_price_syp: 1798160000, fast_sale_price_syp: 1659840000 },
              insights: { sample_count: 120 },
              simulation: { deviation_percent: 3.5, sale_speed_class: 'normal' },
              priority: {
                score: 0.51,
                label: 'watch',
                reasons: ['تذبذب عالي بالسوق'],
              },
            },
          },
          {
            property: {
              id: 11,
              title: 'أرض',
              city: 'damascus',
              address: null,
              type: 'LAND',
              area: 0,
              price: null,
              updated_at: '2026-03-03T10:00:00.000Z',
              created_at: '2026-02-20T10:00:00.000Z',
            },
            ai: {
              status: 'missing_fields',
              missing: ['address', 'area', 'price'],
            },
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
  async portfolio(
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

    return this.ownerPortfolioService.getPortfolio({
      ownerId,
      daysWindow: resolvedDays,
      limit: resolvedLimit,
    });
  }
}
