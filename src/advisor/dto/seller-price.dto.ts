import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SellerPriceDto {
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

  @ApiPropertyOptional({
    example: 'I want to sell quickly but fairly priced.',
  })
  @IsOptional()
  @IsString()
  user_message?: string;
}
