import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateExternalMarketSourceDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  source_type?: string;

  @IsOptional()
  @IsString()
  base_url?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  reliability_score?: number;

  @IsOptional()
  methodology_json?: Record<string, unknown>;
}
