import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PrismaService } from '../prisma/prisma.service';
import { CommissionsService } from '../commissions/commissions.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PrismaService, CommissionsService],
})
export class PaymentsModule {}
