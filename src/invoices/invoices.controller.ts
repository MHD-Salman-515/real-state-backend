import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) { }

  // ---------------------- CREATE ----------------------
  @Post()
  create(@Body() dto: any, @Req() req: any) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new Error('Authentication error: missing user.sub');
    }

    return this.invoicesService.create(dto, userId);
  }

  // ---------------------- GET ALL ----------------------
  @Get()
  findAll() {
    return this.invoicesService.findAll();
  }

  // ---------------------- DELETE ----------------------
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.sub;
    return this.invoicesService.remove(Number(id), userId);
  }

  // ---------------------- SUPPLIER INVOICES ----------------------
  // @Get('supplier/me')
  // getMySupplierInvoices(@Req() req: any) {
  //   const supplierId = req.user?.sub;
  //   return this.invoicesService.getSupplierInvoices(supplierId);
  // }


  @Get("supplier/:id")
  async getSupplierInvoices(@Param("id") supplierId: string) {
    return this.invoicesService.getSupplierInvoices(Number(supplierId));
  }

  // @Get("supplier")
  // async getAllSupplierInvoices() {
  //   return this.invoicesService.getAllSupplierInvoices();
  // }

  // ---------------------- SUPPLIER INVOICES (via expenses) ----------------------
  @Get("supplier/all")
  getAllSupplierInvoices() {
    return this.invoicesService.getAllSupplierInvoices();
  }


}
