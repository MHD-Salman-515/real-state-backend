import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) { }

  // المورد يسجل التكلفة — ويُنشئ النظام فاتورة مرتبطة بهذه التذكرة والعميل
  @Post()
  async create(@Body() data: any, @Req() req: any) {
    return this.expensesService.createWithInvoice(data, req.user.sub);
  }

  // كل المصاريف — للمحاسب والمدير فقط
  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'ACCOUNTANT')
  async findAll() {
    return this.service.findAll();
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
