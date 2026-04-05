import { BadRequestException, Controller, Get, Param, Delete, Put, Body, Post } from '@nestjs/common';
import { UsersService } from './users.service';

const ALLOWED_ROLES = new Set([
  'ADMIN',
  'ACCOUNTANT',
  'CLIENT',
  'OWNER',
  'SUPPLIER',
  'WORKER',
]);

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get('role/:role')
  findByRole(@Param('role') role: string) {
    const normalized = String(role || '').toUpperCase();
    if (!ALLOWED_ROLES.has(normalized)) {
      throw new BadRequestException('Invalid role');
    }
    return this.usersService.findByRole(normalized);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(Number(id));
  }

  // ⬇⬇⬇⬇⬇ الحل هون
  @Post()
  create(@Body() data: any) {
    return this.usersService.create(data);
  }
  // ⬆⬆⬆⬆⬆

  @Put(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.usersService.update(Number(id), data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(Number(id));
  }
}
