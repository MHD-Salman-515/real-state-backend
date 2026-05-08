import {
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  getAll(@Req() req: Request) {
    const userId = (req.user as any).id;
    return this.notificationsService.getForUser(userId);
  }

  @Get('unread-count')
  async getUnreadCount(@Req() req: Request) {
    const userId = (req.user as any).id;
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  @Patch(':id/read')
  markRead(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const userId = (req.user as any).id;
    return this.notificationsService.markAsRead(id, userId);
  }

  @Patch('read-all')
  markAllRead(@Req() req: Request) {
    const userId = (req.user as any).id;
    return this.notificationsService.markAllAsRead(userId);
  }

  @Get('stream')
  stream(@Req() req: Request, @Res() res: Response) {
    const userId = (req.user as any).id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    this.notificationsService.addSseClient(userId, res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      this.notificationsService.removeSseClient(userId, res);
    });
  }
}
