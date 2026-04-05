import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  phone?: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsNotEmpty()
  @IsString()
  otpToken: string;

  // ✔ نسمح بدور واحد من enum الموجود بالـ Prisma
  @IsOptional()
  @IsString()
  role?: 'ADMIN' | 'ACCOUNTANT' | 'CLIENT' | 'OWNER' | 'SUPPLIER' | 'WORKER';
}
