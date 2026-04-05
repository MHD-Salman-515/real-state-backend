import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class EvaluateMarketDto {
  @ApiProperty({ example: 'دمشق' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiPropertyOptional({ example: 'المزة' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiProperty({ example: 'شقة' })
  @IsString()
  @IsNotEmpty()
  property_type!: string;

  @ApiProperty({ example: 120 })
  @IsNumber()
  @Min(1)
  area_m2!: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  bedrooms?: number;

  @ApiProperty({ example: 135000 })
  @IsNumber()
  @Min(1)
  ask_price!: number;
}
