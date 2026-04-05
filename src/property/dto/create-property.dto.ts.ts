import { IsNumber, IsOptional, IsString } from "class-validator";

export class CreatePropertyDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsString()
  address: string;

  @IsString()
  city: string;

  @IsString()
  type: string; // APARTMENT | HOUSE | VILLA | STUDIO

  @IsNumber()
  price: number; 
}
