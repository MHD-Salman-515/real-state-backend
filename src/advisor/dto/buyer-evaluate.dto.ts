import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BuyerEvaluateDto {
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

  @ApiProperty({ example: 120 })
  @IsNumber()
  @Min(1)
  area_m2!: number;

  @ApiPropertyOptional({ example: 1650000000 })
  @ValidateIf((o: BuyerEvaluateDto) => o.ask_price_usd == null)
  @IsNumber()
  @Min(1)
  ask_price_syp?: number;

  @ApiPropertyOptional({ example: 130000 })
  @ValidateIf((o: BuyerEvaluateDto) => o.ask_price_syp == null)
  @IsNumber()
  @Min(1)
  ask_price_usd?: number;

  @ApiPropertyOptional({
    example: 'Is this listing overpriced for this neighborhood?',
  })
  @IsOptional()
  @IsString()
  user_message?: string;
}
