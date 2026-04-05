import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListSessionsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
