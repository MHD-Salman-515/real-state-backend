import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';

@Module({
  providers: [AppointmentsService],
  controllers: [AppointmentsController]
})
export class AppointmentsModule {}
