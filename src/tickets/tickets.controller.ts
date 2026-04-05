import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';

import { TicketsService } from './tickets.service';
import { TicketStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private ticketsService: TicketsService) { }

  // إنشاء تذكرة جديدة (Client)
  @Post()
  create(@Body() data, @Req() req) {
    const clientId = req.user?.id || req.user?.sub;
    return this.ticketsService.create(data, clientId);
  }

  // تذاكر العميل الحالي
  @Get('my')
  getMyTickets(@Req() req) {
    const clientId = req.user?.id || req.user?.sub;
    return this.ticketsService.getMyTickets(clientId);
  }

  // جميع التذاكر
  @Get()
  getAll() {
    return this.ticketsService.findAll();
  }

  // تذاكر العامل الحالي
  @Get('assigned-to/me')
  getAssignedToMe(@Req() req) {
    const workerId = req.user?.id || req.user?.sub;
    return this.ticketsService.getAssignedTo(workerId);
  }

  // تذاكر المورد الحالي
  @Get('supplier/me')
  getForSupplier(@Req() req) {
    const supplierId = req.user?.id || req.user?.sub;
    return this.ticketsService.getForSupplier(supplierId);
  }

  // تذكرة واحدة
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.ticketsService.findOne(Number(id));
  }

  // تحديث التذكرة
  @Put(':id')
  update(@Param('id') id: string, @Body() data, @Req() req) {
    return this.ticketsService.update(Number(id), data, req.user.sub);
  }

  // حذف التذكرة
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.ticketsService.delete(Number(id));
  }

  // تعيين عامل
  @Put(':id/assign-worker/:workerId')
  assignWorker(
    @Param('id') id: string,
    @Param('workerId') workerId: string,
    @Req() req,
  ) {
    return this.ticketsService.assignWorker(
      Number(id),
      Number(workerId),
      req.user.sub,
    );
  }

  // تعيين مورّد
  @Put(':id/assign-supplier/:supplierId')
  assignSupplier(
    @Param('id') id: string,
    @Param('supplierId') supplierId: string,
    @Req() req,
  ) {
    return this.ticketsService.assignSupplier(
      Number(id),
      Number(supplierId),
      req.user.sub,
    );
  }

  // تغيير الحالة
  @UseGuards(JwtAuthGuard)
  @Put(':id/status/:status')
  updateStatus(
    @Param('id') id: string,
    @Param('status') status: TicketStatus,
    @Req() req
  ) {
    // الـ JWT هنا يملأ req.user تلقائياً
    return this.ticketsService.updateStatus(
      Number(id),
      status,
      req.user.sub, // ← الآن ستصله قيمة صحيحة
    );
  }


}
