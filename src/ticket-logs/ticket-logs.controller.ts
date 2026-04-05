import { Controller, Get, Param } from '@nestjs/common';
import { TicketLogsService } from './ticket-logs.service';

@Controller('ticket-logs')
export class TicketLogsController {
  constructor(private ticketLogsService: TicketLogsService) {}

  @Get(':ticketId')
  getLogs(@Param('ticketId') ticketId: string) {
    return this.ticketLogsService.getLogs(Number(ticketId));
  }
}
