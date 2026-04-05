import {
  BadRequestException,
  Body,
  Controller,
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
import { BuyerChatService } from './buyer-chat.service';

@ApiTags('buyer-chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CLIENT')
@Controller('buyer')
export class BuyerChatController {
  constructor(private readonly buyerChatService: BuyerChatService) {}

  @Post('chat/sessions')
  @ApiOperation({ summary: 'Create buyer chat session' })
  @ApiOkResponse({ description: 'Created buyer session' })
  @ApiBadRequestResponse({ description: 'Invalid buyer id or payload' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Buyer role is required' })
  async createSession(
    @Body() body?: { title?: string },
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    return this.buyerChatService.createSession({
      buyerId: this.getBuyerId(req),
      title: body?.title,
    });
  }

  @Get('chat/sessions')
  @ApiOperation({ summary: 'List buyer chat sessions' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async listSessions(
    @Query('limit') limit?: string,
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    const parsedLimit = limit == null || limit === '' ? 20 : Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100');
    }

    return this.buyerChatService.listSessions({
      buyerId: this.getBuyerId(req),
      limit: parsedLimit,
    });
  }

  @Get('chat/sessions/:id/messages')
  @ApiOperation({ summary: 'List buyer chat session messages (ascending)' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  async listMessages(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    const sessionId = this.parsePositiveInt(id, 'session id');
    const parsedLimit = limit == null || limit === '' ? 50 : Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
      throw new BadRequestException('limit must be an integer between 1 and 200');
    }

    return this.buyerChatService.listMessages({
      buyerId: this.getBuyerId(req),
      sessionId,
      limit: parsedLimit,
    });
  }

  @Post('chat/sessions/:id/message')
  @ApiOperation({ summary: 'Send buyer chat message for property search' })
  @ApiOkResponse({ description: 'Assistant response with recommendations payload' })
  async sendMessage(
    @Param('id') id: string,
    @Body() body?: { message?: string },
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    const sessionId = this.parsePositiveInt(id, 'session id');
    return this.buyerChatService.sendMessage({
      buyerId: this.getBuyerId(req),
      sessionId,
      message: String(body?.message || ''),
    });
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'Deterministic ranked property recommendations for buyers' })
  @ApiQuery({ name: 'city', required: false, example: 'damascus' })
  @ApiQuery({ name: 'district', required: false, example: 'mazzeh' })
  @ApiQuery({ name: 'property_type', required: false, example: 'APARTMENT' })
  @ApiQuery({ name: 'area_m2', required: false, example: 120 })
  @ApiQuery({ name: 'budget_syp', required: false, example: 300000000 })
  @ApiQuery({ name: 'limit', required: false, example: 5 })
  async recommendations(
    @Query('city') city?: string,
    @Query('district') district?: string,
    @Query('property_type') propertyType?: string,
    @Query('area_m2') areaM2?: string,
    @Query('budget_syp') budgetSyp?: string,
    @Query('limit') limit?: string,
    @Query('days') days?: string,
  ) {
    const parsedArea = areaM2 == null || areaM2 === '' ? undefined : Number(areaM2);
    if (parsedArea != null && (!Number.isFinite(parsedArea) || parsedArea <= 0)) {
      throw new BadRequestException('area_m2 must be a positive number');
    }
    const parsedBudget = budgetSyp == null || budgetSyp === '' ? undefined : Number(budgetSyp);
    if (parsedBudget != null && (!Number.isFinite(parsedBudget) || parsedBudget <= 0)) {
      throw new BadRequestException('budget_syp must be a positive number');
    }
    const parsedLimit = limit == null || limit === '' ? 5 : Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 20) {
      throw new BadRequestException('limit must be an integer between 1 and 20');
    }
    const parsedDays = days == null || days === '' ? 30 : Number(days);
    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 3650) {
      throw new BadRequestException('days must be an integer between 1 and 3650');
    }

    return this.buyerChatService.getRecommendations({
      city,
      district,
      property_type: propertyType,
      area_m2: parsedArea,
      budget_syp: parsedBudget,
      limit: parsedLimit,
      days: parsedDays,
    });
  }

  private getBuyerId(req?: { user?: { sub?: number | string } }): number {
    const parsed = Number(req?.user?.sub);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('Invalid buyer id');
    }
    return parsed;
  }

  private parsePositiveInt(value: string, fieldName: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }
    return parsed;
  }
}
