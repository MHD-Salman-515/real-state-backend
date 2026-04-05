import { Body, Controller, Post, Param, Get, Req, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly service: PaymentsService) { }

  // -------------------------------------------------------
  // RECORD PAYMENT
  // -------------------------------------------------------
  @Post()
  async createPayment(@Body() dto: any, @Req() req: any) {
    const userId = req.user?.sub; // رقم المستخدم (المحاسب غالباً)

    return this.service.create(dto, userId);
  }

  @Get("invoice/:id")
  async getPaymentsByInvoice(@Param("id") id: string) {
    return this.service.getPaymentsByInvoice(Number(id));
  }

}
