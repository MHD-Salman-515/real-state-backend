import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class SimulateDto {
  @ApiProperty({ example: 'damascus' })
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ example: 'mazzeh' })
  @IsString()
  @IsNotEmpty()
  district!: string;

  @ApiProperty({ example: 'apartment' })
  @IsString()
  @IsNotEmpty()
  property_type!: string;

  @ApiProperty({ example: 140 })
  @IsNumber()
  @Min(1)
  area_m2!: number;

  @ApiProperty({ example: 1800000000 })
  @IsNumber()
  @Min(1)
  proposed_price_syp!: number;

  @ApiPropertyOptional({ example: 90, default: 90 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  days_window?: number;
}
