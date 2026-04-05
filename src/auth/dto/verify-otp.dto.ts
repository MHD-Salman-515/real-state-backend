import { IsEmail, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @Matches(/^\d{6}$/)
  code: string;
}
