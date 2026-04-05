import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
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
import { AdminChatService } from './admin-chat.service';

@ApiTags('admin-chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/chat')
export class AdminChatController {
  constructor(private readonly adminChatService: AdminChatService) {}

  @Get('export')
  @ApiOperation({ summary: 'Export owner chat data for deterministic RAG prep (no PII)' })
  @ApiProduces('application/json', 'text/csv')
  @ApiQuery({ name: 'days', required: false, example: 90 })
  @ApiQuery({ name: 'format', required: false, example: 'json' })
  @ApiQuery({ name: 'session_id', required: false, example: 10 })
  @ApiQuery({ name: 'owner_id', required: false, example: 5 })
  @ApiOkResponse({ description: 'Chat export payload' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  async export(
    @Query('days') days?: string,
    @Query('format') format?: string,
    @Query('session_id') sessionId?: string,
    @Query('owner_id') ownerId?: string,
    @Res() res?: Response,
  ) {
    const resolvedDays = this.parseIntRange(days, 90, 1, 365, 'days');
    const resolvedSessionId = this.parseOptionalPositiveInt(sessionId, 'session_id');
    const resolvedOwnerId = this.parseOptionalPositiveInt(ownerId, 'owner_id');

    const normalizedFormat = String(format || 'json').toLowerCase();
    if (normalizedFormat !== 'json' && normalizedFormat !== 'csv') {
      throw new BadRequestException('format must be json or csv');
    }

    const rows = await this.adminChatService.exportRows({
      days: resolvedDays,
      sessionId: resolvedSessionId,
      ownerId: resolvedOwnerId,
    });

    if (normalizedFormat === 'csv') {
      const csv = this.adminChatService.toCsv(rows);
      res?.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res?.setHeader(
        'Content-Disposition',
        `attachment; filename="chat-export-${resolvedDays}d.csv"`,
      );
      return res?.send(csv);
    }

    return res?.json({ days: resolvedDays, rows });
  }

  @Get('rag-dump')
  @ApiOperation({ summary: 'Export deterministic chat documents for future embeddings' })
  @ApiQuery({ name: 'days', required: false, example: 90 })
  @ApiQuery({ name: 'session_id', required: false, example: 10 })
  @ApiQuery({ name: 'owner_id', required: false, example: 5 })
  @ApiOkResponse({ description: 'RAG-ready chat docs' })
  async ragDump(
    @Query('days') days?: string,
    @Query('session_id') sessionId?: string,
    @Query('owner_id') ownerId?: string,
  ) {
    const resolvedDays = this.parseIntRange(days, 90, 1, 365, 'days');
    const resolvedSessionId = this.parseOptionalPositiveInt(sessionId, 'session_id');
    const resolvedOwnerId = this.parseOptionalPositiveInt(ownerId, 'owner_id');

    const documents = await this.adminChatService.ragDump({
      days: resolvedDays,
      sessionId: resolvedSessionId,
      ownerId: resolvedOwnerId,
    });

    return { days: resolvedDays, documents };
  }

  private parseIntRange(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
    fieldName: string,
  ): number {
    const resolved = value == null || value === '' ? fallback : Number(value);
    if (!Number.isInteger(resolved) || resolved < min || resolved > max) {
      throw new BadRequestException(`${fieldName} must be an integer between ${min} and ${max}`);
    }
    return resolved;
  }

  private parseOptionalPositiveInt(value: string | undefined, fieldName: string): number | undefined {
    if (value == null || value === '') return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }
    return parsed;
  }
}
