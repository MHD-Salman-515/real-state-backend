import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ImportExternalMarketCsvDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  source_id?: number;

  @IsOptional()
  @IsString()
  metric?: string;

  @IsOptional()
  @IsString()
  value_unit?: string;

  @IsOptional()
  @IsInt()
  @Min(6)
  @Max(12)
  months_window?: number;
}
