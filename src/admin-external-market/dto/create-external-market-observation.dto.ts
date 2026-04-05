import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateExternalMarketObservationDto {
  @IsNumber()
  @Min(1)
  source_id!: number;

  @IsString()
  city!: string;

  @IsString()
  district!: string;

  @IsString()
  property_type!: string;

  @IsString()
  metric!: string;

  @IsNumber()
  @Min(0.000001)
  value!: number;

  @IsOptional()
  @IsString()
  value_unit?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsDateString()
  published_at?: string;

  @IsOptional()
  raw_json?: Record<string, unknown>;
}
