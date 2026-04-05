import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { PropertyService } from './property.service';

@Controller('property')
export class PropertyPublicController {
  constructor(private readonly propertyService: PropertyService) {}

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
