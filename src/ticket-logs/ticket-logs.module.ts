import { Module } from '@nestjs/common';
import { TicketLogsController } from './ticket-logs.controller';
import { TicketLogsService } from './ticket-logs.service';

@Module({
  controllers: [TicketLogsController],
  providers: [TicketLogsService]
})
export class TicketLogsModule {}
