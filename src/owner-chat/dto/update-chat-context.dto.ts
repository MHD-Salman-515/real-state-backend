import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateChatContextDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  property_id?: number | null;
}
