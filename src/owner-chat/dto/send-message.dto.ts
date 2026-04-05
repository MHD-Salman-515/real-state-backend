import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

class SendMessageContextDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  propertyId?: number;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsObject()
  context?: SendMessageContextDto;
}
