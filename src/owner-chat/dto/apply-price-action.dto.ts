import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ApplyPriceActionDto {
  @IsInt()
  @Min(1)
  sessionId!: number;

  @IsInt()
  @Min(1)
  propertyId!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  price!: number;

  @IsOptional()
  @IsString()
  log_id?: string;

  @IsOptional()
  @IsString()
  @IsIn(['accepted_fast', 'accepted_balanced', 'accepted_profit', 'accepted_optimal'])
  track_action?:
    | 'accepted_fast'
    | 'accepted_balanced'
    | 'accepted_profit'
    | 'accepted_optimal';
}
