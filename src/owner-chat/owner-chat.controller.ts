import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { CreateSessionDto } from './dto/create-session.dto';
import { ApplyPriceActionDto } from './dto/apply-price-action.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateChatContextDto } from './dto/update-chat-context.dto';
import { OwnerChatService } from './owner-chat.service';

@ApiTags('owner-chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
@Controller('owner/chat')
export class OwnerChatController {
  constructor(private readonly ownerChatService: OwnerChatService) {}

  @Post('sessions')
  @ApiOperation({ summary: 'Create owner chat session' })
  @ApiOkResponse({ description: 'Created session summary' })
  async createSession(
    @Body() body: CreateSessionDto,
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    return this.ownerChatService.createSession({
      ownerId: this.getOwnerId(req),
      title: body?.title,
    });
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List owner chat sessions' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async listSessions(
    @Query('limit') limit?: string,
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    const resolved = limit == null || limit === '' ? 20 : Number(limit);
    if (!Number.isInteger(resolved) || resolved < 1 || resolved > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100');
    }
    return this.ownerChatService.listSessions({
      ownerId: this.getOwnerId(req),
      limit: resolved,
    });
  }

  @Get('sessions/:id/messages')
  @ApiOperation({ summary: 'List session messages (ascending)' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  async listMessages(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    const sessionId = this.parsePositiveInt(id, 'session id');
    const resolved = limit == null || limit === '' ? 50 : Number(limit);
    if (!Number.isInteger(resolved) || resolved < 1 || resolved > 200) {
      throw new BadRequestException('limit must be an integer between 1 and 200');
    }
    return this.ownerChatService.listMessages({
      ownerId: this.getOwnerId(req),
      sessionId,
      limit: resolved,
    });
  }

  @Post('sessions/:id/message')
  @ApiOperation({ summary: 'Send owner chat message (deterministic tool-dispatch)' })
  @ApiOkResponse({ description: 'Assistant response with tail messages' })
  @ApiBadRequestResponse({ description: 'message must be 1..2000 chars' })
  async sendMessage(
    @Param('id') id: string,
    @Body() body: SendMessageDto,
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    const sessionId = this.parsePositiveInt(id, 'session id');
    const propertyIdRaw = (body?.context as { propertyId?: number } | undefined)?.propertyId;
    const propertyId = propertyIdRaw == null ? undefined : Number(propertyIdRaw);
    if (propertyId != null && (!Number.isInteger(propertyId) || propertyId <= 0)) {
      throw new BadRequestException('context.propertyId must be a positive integer');
    }

    return this.ownerChatService.sendMessage({
      ownerId: this.getOwnerId(req),
      sessionId,
      message: String(body?.message || ''),
      context: propertyId ? { propertyId } : undefined,
    });
  }

  @Post('actions/apply-price')
  @ApiOperation({ summary: 'Execute chat APPLY_PRICE action for owner property' })
  @ApiOkResponse({ description: 'Property price updated and chat tool message persisted' })
  async applyPriceAction(
    @Body() body: ApplyPriceActionDto,
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    return this.ownerChatService.applyPriceAction({
      ownerId: this.getOwnerId(req),
      sessionId: Number(body?.sessionId),
      propertyId: Number(body?.propertyId),
      price: Number(body?.price),
      logId: body?.log_id,
      trackAction: body?.track_action,
    });
  }

  @Patch('sessions/:id/context')
  @ApiOperation({ summary: 'Update owner chat session context (property)' })
  async updateSessionContext(
    @Param('id') id: string,
    @Body() body: UpdateChatContextDto,
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    const sessionId = this.parsePositiveInt(id, 'session id');
    const propertyIdRaw = body?.property_id;
    const propertyId =
      propertyIdRaw == null ? null : Number(propertyIdRaw);
    if (
      propertyId != null &&
      (!Number.isInteger(propertyId) || propertyId <= 0)
    ) {
      throw new BadRequestException('property_id must be a positive integer or null');
    }

    return this.ownerChatService.updateSessionContext({
      ownerId: this.getOwnerId(req),
      sessionId,
      propertyId,
    });
  }

  @Patch('sessions/:id/archive')
  @ApiOperation({ summary: 'Archive owner chat session' })
  async archiveSession(
    @Param('id') id: string,
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    const sessionId = this.parsePositiveInt(id, 'session id');
    return this.ownerChatService.archiveSession({
      ownerId: this.getOwnerId(req),
      sessionId,
    });
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Delete owner chat session' })
  async deleteSession(
    @Param('id') id: string,
    @Req() req?: { user?: { sub?: number | string } },
  ) {
    const sessionId = this.parsePositiveInt(id, 'session id');
    return this.ownerChatService.deleteSession({
      ownerId: this.getOwnerId(req),
      sessionId,
    });
  }

  private getOwnerId(req?: { user?: { sub?: number | string } }): number {
    const ownerId = Number(req?.user?.sub);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException('Invalid owner id');
    }
    return ownerId;
  }

  private parsePositiveInt(value: string, fieldName: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }
    return parsed;
  }
}
