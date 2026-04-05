import { IsEmail, IsString, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @ValidateIf((_obj, value) => value !== undefined && value !== null && String(value).trim() !== '')
  @IsEmail()
  email: string;

  @ValidateIf((_obj, value) => value !== undefined && value !== null)
  @IsString()
  @MinLength(1)
  password: string;
}
