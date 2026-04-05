import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  title?: string;
}
