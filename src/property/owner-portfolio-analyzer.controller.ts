import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OwnerPortfolioAnalyzerService } from './owner-portfolio-analyzer.service';

@ApiTags('owner-portfolio-analysis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
@Controller('owner/portfolio')
export class OwnerPortfolioAnalyzerController {
  constructor(
    private readonly ownerPortfolioAnalyzerService: OwnerPortfolioAnalyzerService,
  ) {}

  @Get('analysis')
  @ApiOperation({ summary: 'Owner portfolio AI analyzer (deterministic + explainable)' })
  @ApiOkResponse({
    description: 'Portfolio analysis payload',
    schema: {
      example: {
        summary: { total: 4, overpriced: 1, fair: 2, underpriced: 1 },
        items: [
          {
            propertyId: 10,
            title: 'شقة بالمزة',
            current_price_syp: 2100000000,
            optimal_price_syp: 1800000000,
            fast_sale_price_syp: 1690000000,
            deviation_pct: 0.1667,
            label: 'OVERPRICED',
            recommendation: 'السعر أعلى من السوق. يُفضل اعتماد السعر الأمثل أو سعر البيع السريع.',
            explain_trace: {
              inputs_used: { district: 'mazzeh', area_m2: 150 },
              computation_steps: [{ step: 'deviation_pct = (current - optimal)/optimal' }],
            },
            suggested_actions: [
              { type: 'APPLY_PRICE', target: 'OPTIMAL', price: 1800000000 },
            ],
          },
        ],
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Owner role is required' })
  async getAnalysis(@Req() req?: { user?: { sub?: number | string } }) {
    const ownerId = this.getOwnerId(req);
    return this.ownerPortfolioAnalyzerService.getAnalysis({ ownerId });
  }

  @Post('apply-recommendation')
  @ApiOperation({ summary: 'Apply deterministic recommendation price to owner property' })
  @ApiOkResponse({
    description: 'Applied price result',
    schema: {
      example: {
        propertyId: 10,
        target: 'OPTIMAL',
        applied_price_syp: 1800000000,
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid input or missing market estimate' })
  async applyRecommendation(
    @Body() body?: { propertyId?: number; target?: 'OPTIMAL' | 'FAST' | 'RAISE_TO_OPTIMAL' },
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    const ownerId = this.getOwnerId(req);
    const propertyId = Number(body?.propertyId);
    const target = String(body?.target || 'OPTIMAL').toUpperCase();

    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      throw new BadRequestException('propertyId must be a positive integer');
    }

    if (target !== 'OPTIMAL' && target !== 'FAST' && target !== 'RAISE_TO_OPTIMAL') {
      throw new BadRequestException('target must be OPTIMAL | FAST | RAISE_TO_OPTIMAL');
    }

    return this.ownerPortfolioAnalyzerService.applyRecommendation({
      ownerId,
      propertyId,
      target: target as 'OPTIMAL' | 'FAST' | 'RAISE_TO_OPTIMAL',
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
