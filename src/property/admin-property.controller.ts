import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PropertyService } from './property.service';
import { AdminCreatePropertyDto } from './dto/admin-create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';

const mapType = (t: string) => {
  switch (t) {
    case 'بيع':
      return 'HOUSE';
    case 'إيجار':
      return 'APARTMENT';
    default:
      return t?.toUpperCase?.() || 'HOUSE';
  }
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/properties')
export class AdminPropertyController {
  constructor(private readonly propertyService: PropertyService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.propertyService.findAllAdmin(
      this.parsePositiveInt(page, 1, 'page'),
      this.parsePositiveInt(limit, 50, 'limit'),
    );
  }

  @Post()
  create(@Body() data: AdminCreatePropertyDto, @Req() req: { user?: { sub?: number } }) {
    return this.propertyService.create(
      {
        ...data,
        type: mapType(data.type),
      },
      Number(data.ownerId),
      data.image ?? null,
      Number(req.user?.sub) || null,
    );
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() data: UpdatePropertyDto,
    @Req() req: { user?: { sub?: number } },
  ) {
    return this.propertyService.update(
      Number(id),
      {
        ...data,
        type: data.type ? mapType(data.type) : data.type,
      },
      data.image,
      Number(req.user?.sub) || null,
    );
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: { user?: { sub?: number } }) {
    return this.propertyService.delete(Number(id), Number(req.user?.sub) || null);
  }

  private parsePositiveInt(value: string | undefined, fallback: number, fieldName: string): number {
    const resolved = value == null || value === '' ? fallback : Number(value);
    if (!Number.isInteger(resolved) || resolved <= 0) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }
    return resolved;
  }
}
