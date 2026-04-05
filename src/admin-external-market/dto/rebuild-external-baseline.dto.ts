import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RebuildExternalBaselineDto {
  @IsOptional()
  @IsInt()
  @Min(6)
  @Max(12)
  months_window?: number;
}
