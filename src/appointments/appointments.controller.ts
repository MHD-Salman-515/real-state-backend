import { AppointmentsService } from './appointments.service';
import { Body, Controller, Delete, Get, Param, Post, Patch } from '@nestjs/common';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  // إنشاء موعد
  @Post()
  create(@Body() data) {
    return this.appointmentsService.create(data);
  }

  // 🔥 جلب جميع المواعيد (المسار الذي يحتاجه الفرونت)
  @Get()
  getAll() {
    return this.appointmentsService.findAll();
  }

  // جلب موعد واحد
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(Number(id));
  }

  // تحديث حالة الموعد
  @Patch(':id')
  updateStatus(@Param('id') id: string, @Body() body: any) {
    return this.appointmentsService.update(Number(id), body);
  }

  // حذف الموعد
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.appointmentsService.delete(Number(id));
  }
}
