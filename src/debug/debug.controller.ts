import { Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../auth/auth.service';
import { AuthHitsService } from '../auth/auth-hits.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('debug')
export class DebugController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly authHits: AuthHitsService,
    private readonly mailService: MailService,
  ) {}

  private normalizeEmail(email: string): string {
    return String(email || '').trim().toLowerCase();
  }

  private getPasswordPepperValue(): string {
    return (
      process.env.PASSWORD_PEPPER ??
      process.env.AUTH_PEPPER ??
      process.env.BCRYPT_PEPPER ??
      ''
    );
  }

  private getPasswordPeppered(raw: string): string {
    return String(raw ?? '') + this.getPasswordPepperValue();
  }

  private assertDevOnly() {
    if (String(process.env.NODE_ENV || 'development').toLowerCase() === 'production') {
      throw new NotFoundException();
    }
  }

  @Get('ping')
  ping() {
    this.assertDevOnly();
    return { ok: true };
  }

  @Get('db')
  async db() {
    this.assertDevOnly();
    const [users, properties] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.property.count(),
    ]);

    return {
      ok: true,
      user_count: users,
      property_count: properties,
    };
  }

  @Get('user-by-email')
  async userByEmail(@Query('email') email?: string) {
    this.assertDevOnly();
    const normalizedEmail = this.normalizeEmail(email || '');
    if (!normalizedEmail) {
      return {
        found: false,
        normalizedEmail,
        user: null,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        password: true,
        createdAt: true,
      },
    });

    return {
      found: Boolean(user),
      normalizedEmail,
      user: user
        ? {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            hasPassword: Boolean(user.password),
            createdAt: user.createdAt,
          }
        : null,
    };
  }

  @Get('user-password-meta')
  async userPasswordMeta(@Query('email') email?: string) {
    this.assertDevOnly();
    const normalizedEmail = this.normalizeEmail(email || '');
    const user = normalizedEmail
      ? await this.prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { password: true },
        })
      : null;

    const hash = user?.password || '';
    return {
      found: Boolean(user),
      passwordHashPrefix: hash ? hash.slice(0, 7) : null,
      passwordHashLength: hash ? hash.length : 0,
      usesPepper: Boolean(this.getPasswordPepperValue()),
    };
  }

  @Post('compare-password')
  async comparePassword(
    @Body() body: { email?: string; password?: string },
  ) {
    this.assertDevOnly();
    const normalizedEmail = this.normalizeEmail(body?.email || '');
    const rawPassword = String(body?.password || '');

    if (!normalizedEmail) {
      return {
        found: false,
        compareResult: false,
        passwordHashPrefix: null,
        passwordHashLength: 0,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { password: true },
    });
    if (!user?.password) {
      return {
        found: false,
        compareResult: false,
        passwordHashPrefix: null,
        passwordHashLength: 0,
      };
    }

    const compareResult = await bcrypt.compare(
      this.getPasswordPeppered(rawPassword),
      user.password,
    );

    return {
      found: true,
      compareResult,
      passwordHashPrefix: user.password.slice(0, 7),
      passwordHashLength: user.password.length,
    };
  }

  @Post('login-trace')
  async loginTrace(@Body() body: { email?: string; password?: string }) {
    this.assertDevOnly();
    const authService = this.moduleRef.get(AuthService, { strict: false });
    if (!authService) {
      return {
        step: 'start',
        normalizedEmail: this.normalizeEmail(String(body?.email || '')),
        found: false,
        hasPassword: false,
        compareResult: false,
        emailVerifiedAtNull: null,
        role: null,
        jwtSecretPresent: false,
        errorMessageIfAny: 'AuthService not available',
      };
    }
    const trace = await authService.traceLegacyLogin({
      email: String(body?.email || ''),
      password: String(body?.password || ''),
    });
    return trace;
  }

  @Post('hit-auth-login')
  async hitAuthLogin(@Body() body: { email?: string; password?: string }) {
    this.assertDevOnly();
    const authService = this.moduleRef.get(AuthService, { strict: false });
    if (!authService) {
      return {
        reached: false,
        statusCode: 500,
        trace: {
          step: 'start',
          normalizedEmail: this.normalizeEmail(String(body?.email || '')),
          found: false,
          hasPassword: false,
          compareResult: false,
          emailVerifiedAtNull: null,
          role: null,
          jwtSecretPresent: false,
          errorMessageIfAny: 'AuthService not available',
        },
      };
    }

    const result = await authService.runLegacyLoginFlowPublic({
      email: String(body?.email || ''),
      password: String(body?.password || ''),
    });

    return {
      reached: true,
      statusCode: result.statusCode,
      trace: result.trace,
    };
  }

  @Get('auth-hits')
  authHitsRecent() {
    this.assertDevOnly();
    return {
      ok: true,
      entries: this.authHits.latest(20),
    };
  }

  @Get('mail')
  async mail() {
    this.assertDevOnly();
    const info = this.mailService.getMailRuntimeInfo();
    let verified = false;
    try {
      verified = await this.mailService.verifyConnection();
    } catch {
      verified = false;
    }
    return {
      ok: true,
      verified,
      provider: info.provider,
      enabled: info.enabled,
      from: info.from,
    };
  }
}
