import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBuyerSavedSearchDto {
  @ApiPropertyOptional({ example: 'شقق المزة ضمن 300 مليون' })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  title?: string;

  @ApiProperty({
    example: {
      city: 'damascus',
      district: 'mazzeh',
      property_type: 'APARTMENT',
      area_m2: 120,
      budget_syp: 300000000,
    },
  })
  @IsObject()
  filtersJson!: Record<string, unknown>;
}
