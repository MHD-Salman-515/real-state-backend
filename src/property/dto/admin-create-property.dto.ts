import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class AdminCreatePropertyDto {
  @Type(() => Number)
  @IsNumber()
  ownerId: number;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  area?: number;

  @IsString()
  city: string;

  @IsString()
  @IsOptional()
  image?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  price?: number;

  @IsString()
  type: string;
}
