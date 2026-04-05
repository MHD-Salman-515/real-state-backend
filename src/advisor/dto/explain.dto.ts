import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class ExplainDto {
  @IsString()
  @IsIn(['seller', 'buyer'])
  mode!: 'seller' | 'buyer';

  @IsOptional()
  @IsString()
  user_message?: string;

  @IsObject()
  @IsNotEmpty()
  result!: Record<string, unknown>;
}
