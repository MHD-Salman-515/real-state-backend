import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) { }

  // المورد يسجل التكلفة — ويُنشئ النظام فاتورة مرتبطة بهذه التذكرة والعميل
  @Post()
  async create(@Body() data: any, @Req() req: any) {
    return this.expensesService.createWithInvoice(data, req.user.sub);
  }

  // كل مصاريف هذا المورد
  @Get('my')
  myExpenses(@Req() req: any) {
    return this.expensesService.findMy(req.user.sub);
  }

  // مصاريف هذا المورد لتذكرة معيّنة
  @Get('by-ticket/:ticketId')
  byTicket(@Param('ticketId') ticketId: string, @Req() req: any) {
    return this.expensesService.findByTicket(Number(ticketId), req.user.sub);
  }

  @Get("supplier")
  async getAllSupplierExpenses() {
    return this.expensesService.getAllSupplierExpenses();

  }

}
