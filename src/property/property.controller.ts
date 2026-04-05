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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PropertyService } from './property.service';

import { UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";

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

const storageConfig = {
  storage: diskStorage({
    destination: "./uploads/properties",
    filename: (req, file, cb) => {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, unique + extname(file.originalname));
    },
  }),
};

@Controller('properties')
export class PropertyController {
  constructor(private readonly propertyService: PropertyService) { }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.propertyService.findPublic(
      this.parsePositiveInt(page, 1, 'page'),
      this.parsePublicLimit(limit),
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.propertyService.findOne(Number(id));
  }

  // =============================
  //        CREATE PROPERTY
  // =============================
  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(FileInterceptor("image", storageConfig))
  create(@Body() data: any, @UploadedFile() file: any, @Req() req: any) {
    const ownerId = Number(req.user?.sub);
    const imagePath = file ? `/uploads/properties/${file.filename}` : null;

    return this.propertyService.create(
      {
        ...data,
        type: mapType(data.type),
      },
      ownerId,
      imagePath,
      Number(req.user?.sub) || null,
    );
  }

  // =============================
  //        UPDATE PROPERTY
  // =============================
  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @UseInterceptors(FileInterceptor("image", storageConfig))
  update(
    @Param('id') id: string,
    @Body() data: any,
    @UploadedFile() file: any,
    @Req() req: any
  ) {
    const ownerId = Number(req.user?.sub);
    const imagePath = file ? `/uploads/properties/${file.filename}` : undefined;

    return this.propertyService.updateOwned(
      ownerId,
      Number(id),
      {
        ...data,
        type: mapType(data.type),
      },
      imagePath,
      Number(req.user?.sub) || null,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: any) {
    const ownerId = Number(req.user?.sub);
    return this.propertyService.deleteOwned(ownerId, Number(id), ownerId || null);
  }

  private parsePositiveInt(value: string | undefined, fallback: number, fieldName: string): number {
    const resolved = value == null || value === '' ? fallback : Number(value);
    if (!Number.isInteger(resolved) || resolved <= 0) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }
    return resolved;
  }

  private parsePublicLimit(value: string | undefined): number {
    const resolved = value == null || value === '' ? 20 : Number(value);
    if (!Number.isInteger(resolved) || resolved <= 0) {
      throw new BadRequestException('limit must be a positive integer');
    }
    return Math.min(resolved, 20);
  }
}
