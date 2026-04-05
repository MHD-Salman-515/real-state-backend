import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { OtpRequestDto } from './dto/otp-request.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { isProduction } from '../config/runtime-env';

@Controller(['auth', 'api/auth'])
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private buildAuthCookieOptions(maxAge: number): CookieOptions {
    const secure = isProduction();

    return {
      httpOnly: true,
      secure,
      sameSite: secure ? 'none' : 'lax',
      path: '/',
      maxAge,
    };
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie(
      'access_token',
      accessToken,
      this.buildAuthCookieOptions(Number(process.env.ACCESS_TOKEN_TTL ?? 900) * 1000),
    );

    res.cookie(
      'refresh_token',
      refreshToken,
      this.buildAuthCookieOptions(Number(process.env.REFRESH_TOKEN_TTL ?? 604800) * 1000),
    );
  }

  private clearAuthCookies(res: Response) {
    const baseCookie = this.buildAuthCookieOptions(0);
    res.clearCookie('access_token', baseCookie);
    res.clearCookie('refresh_token', baseCookie);
  }

  @Post('sign-up')
  @HttpCode(200)
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }

  @Post('sign-in')
  @HttpCode(200)
  signIn(@Body() dto: SignInDto) {
    return this.authService.signIn(dto);
  }

  @Post('verify-otp')
  @HttpCode(200)
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyOtp(dto);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    return {
      ok: true,
      role: result.role,
      redirectTo: result.redirectTo,
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('resend-otp')
  @HttpCode(200)
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @Post('sign-out')
  @HttpCode(200)
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    await this.authService.signOut(refreshToken);
    this.clearAuthCookies(res);
    return { ok: true };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const result = await this.authService.refresh(refreshToken);
    this.setAuthCookies(res, result.accessToken, result.refreshToken);
    return {
      ok: true,
      role: result.role,
      redirectTo: result.redirectTo,
    };
  }

  // Legacy endpoints kept for compatibility with existing clients.
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('otp/request')
  @HttpCode(200)
  otpRequest(@Body() dto: OtpRequestDto, @Req() req: Request) {
    return this.authService.requestEmailOtp(dto, req.ip);
  }

  @Post('otp/verify')
  @HttpCode(200)
  otpVerify(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyEmailOtpCode(dto);
  }

  @Get('oauth/google')
  @UseGuards(AuthGuard('google'))
  oauthGoogleStart() {
    return;
  }

  @Get('oauth/google/callback')
  @UseGuards(AuthGuard('google'))
  async oauthGoogleCallback(@Req() req: Request, @Res() res: Response) {
    const result = req.user as { accessToken: string; refreshToken: string } | undefined;
    if (!result?.accessToken) {
      throw new UnauthorizedException('OAuth authentication failed');
    }
    const redirectUrl = this.authService.buildOAuthFrontendRedirect(
      result.accessToken,
      result.refreshToken,
    );
    return res.redirect(redirectUrl);
  }

  @Get('oauth/github')
  @UseGuards(AuthGuard('github'))
  oauthGithubStart() {
    return;
  }

  @Get('oauth/github/callback')
  @UseGuards(AuthGuard('github'))
  async oauthGithubCallback(@Req() req: Request, @Res() res: Response) {
    const result = req.user as { accessToken: string; refreshToken: string } | undefined;
    if (!result?.accessToken) {
      throw new UnauthorizedException('OAuth authentication failed');
    }
    const redirectUrl = this.authService.buildOAuthFrontendRedirect(
      result.accessToken,
      result.refreshToken,
    );
    return res.redirect(redirectUrl);
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: LoginDto) {
    const email = String(dto?.email || '').trim();
    const password = String(dto?.password || '');
    if (!email || !password) {
      throw new BadRequestException('email and password are required');
    }

    try {
      const result = await this.authService.runLegacyLoginFlowPublic(dto);
      if (result.statusCode === 200) {
        return { token: result.token, user: result.user };
      }
      if (result.statusCode === 401) {
        throw new UnauthorizedException('Invalid credentials');
      }
      if (result.statusCode === 403) {
        throw new ForbiddenException(result.trace.errorMessageIfAny || 'Forbidden');
      }
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return req.user;
  }
}

@Controller('owner')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
export class OwnerAuthController {
  @Get('me')
  ownerMe(@Req() req: any) {
    return {
      id: req.user?.sub ?? req.user?.id,
      email: req.user?.email,
      role: req.user?.role,
    };
  }
}
