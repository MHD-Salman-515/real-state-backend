import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { OtpRequestDto } from './dto/otp-request.dto';
import { MailService } from '../mail/mail.service';

const OTP_TTL_SECONDS = 10 * 60;
const OTP_MAX_ATTEMPTS = 5;
const OTP_COOLDOWN_SECONDS = 30;
const OTP_RATE_LIMIT_WINDOW_MIN = 10;
const OTP_MAX_SENDS_PER_WINDOW = 5;

type LoginTraceStep =
  | 'start'
  | 'normalized'
  | 'user_found'
  | 'has_password'
  | 'compare'
  | 'email_verified_check'
  | 'role_check'
  | 'jwt_sign'
  | 'done';

type LegacyLoginTrace = {
  step: LoginTraceStep;
  normalizedEmail: string;
  found: boolean;
  hasPassword: boolean;
  compareResult: boolean;
  emailVerifiedAtNull: boolean | null;
  role: string | null;
  jwtSecretPresent: boolean;
  errorMessageIfAny: string | null;
};

@Injectable()
export class AuthService {
  private readonly otpIpRateBucket = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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

  private async hashPassword(raw: string): Promise<string> {
    return bcrypt.hash(this.getPasswordPeppered(raw), 10);
  }

  private async verifyPassword(raw: string, hash: string): Promise<boolean> {
    return bcrypt.compare(this.getPasswordPeppered(raw), hash);
  }

  private hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private safeEqualHash(left: string, right: string): boolean {
    const leftBuf = Buffer.from(left);
    const rightBuf = Buffer.from(right);
    if (leftBuf.length !== rightBuf.length) {
      return false;
    }
    return timingSafeEqual(leftBuf, rightBuf);
  }

  private generateOtpCode(): string {
    const random = randomBytes(4).readUInt32BE(0) % 1_000_000;
    return String(random).padStart(6, '0');
  }

  private accessTtlSeconds(): number {
    return Number(process.env.ACCESS_TOKEN_TTL ?? 900);
  }

  private refreshTtlSeconds(): number {
    return Number(process.env.REFRESH_TOKEN_TTL ?? 604800);
  }

  private accessSecret(): string {
    return process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'dev-access-secret';
  }

  private refreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'dev-refresh-secret';
  }

  private otpSecret(): string {
    return process.env.JWT_OTP_SECRET || this.accessSecret();
  }

  private otpTokenTtlSeconds(): number {
    return Number(process.env.OTP_TOKEN_TTL ?? 900);
  }

  private readonly authUserResponseSelect = {
    id: true,
    fullName: true,
    email: true,
    phone: true,
    role: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  private async issueAccessToken(user: Pick<User, 'id' | 'email' | 'role'>): Promise<string> {
    return this.jwtService.signAsync(
      { sub: user.id, id: user.id, email: user.email, role: user.role },
      { secret: this.accessSecret(), expiresIn: this.accessTtlSeconds() },
    );
  }

  private async issueRefreshToken(user: Pick<User, 'id' | 'email' | 'role'>): Promise<string> {
    return this.jwtService.signAsync(
      { sub: user.id, id: user.id, email: user.email, role: user.role, typ: 'refresh' },
      { secret: this.refreshSecret(), expiresIn: this.refreshTtlSeconds() },
    );
  }

  private async issueEmailOtpToken(email: string): Promise<string> {
    return this.jwtService.signAsync(
      { email, otp_verified: true, typ: 'email_otp' },
      { secret: this.otpSecret(), expiresIn: this.otpTokenTtlSeconds() },
    );
  }

  private async assertValidEmailOtpToken(token: string, email: string): Promise<void> {
    if (!token) {
      throw new BadRequestException('otpToken is required');
    }

    let payload: { email?: string; otp_verified?: boolean; typ?: string };
    try {
      payload = await this.jwtService.verifyAsync(token, { secret: this.otpSecret() });
    } catch {
      throw new BadRequestException('Invalid or expired otpToken');
    }

    if (
      payload.typ !== 'email_otp' ||
      payload.otp_verified !== true ||
      this.normalizeEmail(payload.email || '') !== this.normalizeEmail(email)
    ) {
      throw new BadRequestException('Invalid or expired otpToken');
    }
  }

  private redirectForRole(role: Role): string {
    if (role === 'OWNER') return '/owner/dashboard';
    if (role === 'ADMIN') return '/admin';
    return '/dashboard';
  }

  private isOtpRequired(): boolean {
    return String(process.env.OTP_REQUIRED || '').toLowerCase() === 'true';
  }

  private isEmailVerificationRequired(): boolean {
    return String(process.env.EMAIL_VERIFICATION_REQUIRED || '').toLowerCase() === 'true';
  }

  private isRoleAllowed(role: string): boolean {
    const raw = String(process.env.AUTH_ALLOWED_ROLES || '').trim();
    if (!raw) {
      return true;
    }
    const allowed = raw
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    return allowed.includes(String(role || '').toUpperCase());
  }

  private enforceOtpIpRateLimit(email: string, requestIp?: string): void {
    const normalizedEmail = this.normalizeEmail(email);
    const ip = String(requestIp || 'unknown').trim() || 'unknown';
    const key = `${ip}:${normalizedEmail}`;
    const now = Date.now();
    const windowMs = OTP_RATE_LIMIT_WINDOW_MIN * 60 * 1000;
    const lowerBound = now - windowMs;

    const history = (this.otpIpRateBucket.get(key) || []).filter((ts) => ts >= lowerBound);
    if (history.length >= OTP_MAX_SENDS_PER_WINDOW) {
      this.otpIpRateBucket.set(key, history);
      throw new HttpException('Please wait before requesting again', HttpStatus.TOO_MANY_REQUESTS);
    }

    history.push(now);
    this.otpIpRateBucket.set(key, history);
  }

  private frontendOAuthRedirect(): string {
    const configuredRedirect = String(process.env.FRONTEND_OAUTH_REDIRECT || '').trim();
    if (configuredRedirect) {
      return configuredRedirect;
    }

    const configuredOrigin = String(process.env.CORS_ORIGIN || '')
      .split(',')
      .map((item) => item.trim())
      .find(Boolean);

    if (configuredOrigin) {
      return `${configuredOrigin.replace(/\/+$/, '')}/auth/oauth/callback`;
    }

    return 'https://urbanex-frontend.vercel.app/auth/oauth/callback';
  }

  buildOAuthFrontendRedirect(accessToken: string, refreshToken?: string): string {
    const base = this.frontendOAuthRedirect();
    const query = new URLSearchParams({ token: accessToken });
    if (refreshToken) {
      query.set('refresh', refreshToken);
    }
    return `${base}${base.includes('?') ? '&' : '?'}${query.toString()}`;
  }

  private async runLegacyLoginFlow(
    dto: LoginDto,
  ): Promise<{ trace: LegacyLoginTrace; token?: string; user?: Record<string, unknown>; statusCode: number }> {
    const trace: LegacyLoginTrace = {
      step: 'start',
      normalizedEmail: '',
      found: false,
      hasPassword: false,
      compareResult: false,
      emailVerifiedAtNull: null,
      role: null,
      jwtSecretPresent: Boolean(process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET),
      errorMessageIfAny: null,
    };

    try {
      const email = this.normalizeEmail(dto.email);
      trace.normalizedEmail = email;
      trace.step = 'normalized';

      const user = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          emailVerifiedAt: true,
          password: true,
        },
      });

      trace.step = 'user_found';
      trace.found = Boolean(user);

      if (!user) {
        trace.errorMessageIfAny = 'Invalid credentials';
        return { trace, statusCode: 401 };
      }

      trace.hasPassword = Boolean(user.password);
      trace.role = user.role;
      trace.emailVerifiedAtNull = user.emailVerifiedAt == null;
      trace.step = 'has_password';

      if (!user.password) {
        trace.errorMessageIfAny = 'Invalid credentials';
        return { trace, statusCode: 401 };
      }

      const compareResult = await this.verifyPassword(dto.password, user.password);
      trace.compareResult = compareResult;
      trace.step = 'compare';

      if (!compareResult) {
        trace.errorMessageIfAny = 'Invalid credentials';
        return { trace, statusCode: 401 };
      }

      trace.step = 'email_verified_check';
      if (this.isEmailVerificationRequired() && user.emailVerifiedAt == null) {
        trace.errorMessageIfAny = 'Email not verified';
        return { trace, statusCode: 403 };
      }

      trace.step = 'role_check';
      if (!this.isRoleAllowed(user.role)) {
        trace.errorMessageIfAny = 'Role not allowed';
        return { trace, statusCode: 403 };
      }

      trace.step = 'jwt_sign';
      if (!trace.jwtSecretPresent) {
        trace.errorMessageIfAny = 'JWT secret is missing. Set JWT_ACCESS_SECRET or JWT_SECRET.';
        return { trace, statusCode: 500 };
      }

      const token = await this.issueAccessToken(user);
      const { password: _password, ...safeUser } = user;
      trace.step = 'done';
      return { trace, token, user: safeUser, statusCode: 200 };
    } catch (error) {
      trace.errorMessageIfAny = error instanceof Error ? error.message : 'Internal server error';
      return { trace, statusCode: 500 };
    }
  }

  async traceLegacyLogin(dto: LoginDto): Promise<LegacyLoginTrace> {
    const result = await this.runLegacyLoginFlow(dto);
    return result.trace;
  }

  async runLegacyLoginFlowPublic(dto: LoginDto): Promise<{
    trace: LegacyLoginTrace;
    token?: string;
    user?: Record<string, unknown>;
    statusCode: number;
  }> {
    return this.runLegacyLoginFlow(dto);
  }

  private async createAndSendOtp(email: string, userId?: number, requestIp?: string): Promise<Date> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - OTP_RATE_LIMIT_WINDOW_MIN * 60 * 1000);
    this.enforceOtpIpRateLimit(email, requestIp);

    const sentCount = await this.prisma.emailOtp.count({
      where: {
        email,
        createdAt: { gte: windowStart },
      },
    });

    if (sentCount >= OTP_MAX_SENDS_PER_WINDOW) {
      throw new HttpException('Please wait before requesting again', HttpStatus.TOO_MANY_REQUESTS);
    }

    const latest = await this.prisma.emailOtp.findFirst({
      where: {
        email,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (latest && now.getTime() - latest.lastSentAt.getTime() < OTP_COOLDOWN_SECONDS * 1000) {
      throw new HttpException('Please wait before requesting again', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = this.generateOtpCode();
    const codeHash = this.hashValue(code);
    const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

    await this.prisma.emailOtp.create({
      data: {
        email,
        userId,
        codeHash,
        expiresAt,
        attempts: 0,
        maxAttempts: OTP_MAX_ATTEMPTS,
        lastSentAt: now,
      },
    });

    try {
      await this.mailService.sendOtpEmail(email, code, expiresAt);
    } catch {
      throw new HttpException(
        'Failed to send OTP email. Check SMTP configuration.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return expiresAt;
  }

  async requestEmailOtp(
    dto: OtpRequestDto,
    requestIp?: string,
  ): Promise<{ ok: true; expiresAt: string }> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    const expiresAt = await this.createAndSendOtp(email, user?.id, requestIp);
    return { ok: true, expiresAt: expiresAt.toISOString() };
  }

  async verifyEmailOtpCode(dto: VerifyOtpDto): Promise<{ ok: true; otpToken: string }> {
    const email = this.normalizeEmail(dto.email);
    const now = new Date();

    const otp = await this.prisma.emailOtp.findFirst({
      where: {
        email,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('Code expired or not found');
    }

    if (otp.attempts >= otp.maxAttempts) {
      throw new HttpException('Too many attempts', HttpStatus.TOO_MANY_REQUESTS);
    }

    const incomingHash = this.hashValue(dto.code);
    const isMatch = this.safeEqualHash(otp.codeHash, incomingHash);
    if (!isMatch) {
      await this.prisma.emailOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid code');
    }

    await this.prisma.emailOtp.update({
      where: { id: otp.id },
      data: { consumedAt: now },
    });

    const otpToken = await this.issueEmailOtpToken(email);
    return { ok: true, otpToken };
  }

  async signUp(dto: SignUpDto): Promise<
    | { ok: true; next: 'otp' }
    | {
        ok: true;
        role: Role;
        redirectTo: string;
        accessToken: string;
        user: Pick<User, 'id' | 'email' | 'role' | 'fullName'>;
      }
  > {
    const email = this.normalizeEmail(dto.email);
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      const passwordHash = await this.hashPassword(dto.password);
      user = await this.prisma.user.create({
        data: {
          fullName: dto.name?.trim() || 'New User',
          email,
          password: passwordHash,
          role: 'CLIENT',
        },
      });
    }

    if (this.isOtpRequired()) {
      await this.createAndSendOtp(email, user.id);
      return { ok: true, next: 'otp' };
    }

    const accessToken = await this.issueAccessToken(user);
    return {
      ok: true,
      role: user.role,
      redirectTo: this.redirectForRole(user.role),
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      },
    };
  }

  async signIn(dto: SignInDto): Promise<
    | { ok: true; next: 'otp' }
    | {
        ok: true;
        role: Role;
        redirectTo: string;
        accessToken: string;
        user: Pick<User, 'id' | 'email' | 'role' | 'fullName'>;
      }
  > {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await this.verifyPassword(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (this.isOtpRequired()) {
      await this.createAndSendOtp(email, user.id);
      return { ok: true, next: 'otp' };
    }

    const accessToken = await this.issueAccessToken(user);
    return {
      ok: true,
      role: user.role,
      redirectTo: this.redirectForRole(user.role),
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      },
    };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{
    ok: true;
    role: Role;
    redirectTo: string;
    accessToken: string;
    refreshToken: string;
    user: Pick<User, 'id' | 'email' | 'role' | 'fullName'>;
  }> {
    const email = this.normalizeEmail(dto.email);
    const now = new Date();

    const otp = await this.prisma.emailOtp.findFirst({
      where: {
        email,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp || otp.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException('Code expired or invalid');
    }

    if (otp.attempts >= otp.maxAttempts) {
      throw new UnauthorizedException('Code expired or invalid');
    }

    const incomingHash = this.hashValue(dto.code);
    const isMatch = this.safeEqualHash(otp.codeHash, incomingHash);

    if (!isMatch) {
      await this.prisma.emailOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Code expired or invalid');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Code expired or invalid');
    }

    await this.prisma.$transaction([
      this.prisma.emailOtp.update({
        where: { id: otp.id },
        data: { consumedAt: now },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now },
      }),
    ]);

    const accessToken = await this.issueAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashValue(refreshToken),
        expiresAt: new Date(now.getTime() + this.refreshTtlSeconds() * 1000),
      },
    });

    return {
      ok: true,
      role: user.role,
      redirectTo: this.redirectForRole(user.role),
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      },
    };
  }

  async resendOtp(dto: ResendOtpDto): Promise<{ ok: true }> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    await this.createAndSendOtp(email, user?.id);
    return { ok: true };
  }

  async signOut(refreshToken?: string): Promise<{ ok: true }> {
    if (refreshToken) {
      const tokenHash = this.hashValue(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  async refresh(refreshToken: string): Promise<{
    ok: true;
    accessToken: string;
    refreshToken: string;
    role: Role;
    redirectTo: string;
  }> {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    let payload: { sub: number; typ?: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: number; typ?: string }>(refreshToken, {
        secret: this.refreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const storedHash = this.hashValue(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        userId: payload.sub,
        tokenHash: storedHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newAccessToken = await this.issueAccessToken(user);
    const newRefreshToken = await this.issueRefreshToken(user);

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashValue(newRefreshToken),
          expiresAt: new Date(Date.now() + this.refreshTtlSeconds() * 1000),
        },
      }),
    ]);

    return {
      ok: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      role: user.role,
      redirectTo: this.redirectForRole(user.role),
    };
  }

  // Legacy endpoints kept for backward compatibility.
  async register(dto: RegisterDto) {
    const isDev = String(process.env.NODE_ENV || '').toLowerCase() !== 'production';
    const rawEmail = dto.email;
    const normalizedEmail = this.normalizeEmail(dto.email);

    if (isDev) {
      console.log('[auth/register] raw_email:', rawEmail);
      console.log('[auth/register] normalized_email:', normalizedEmail);
    }

    await this.assertValidEmailOtpToken(dto.otpToken, normalizedEmail);

    const exists = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    const password = await this.hashPassword(dto.password);
    const now = new Date();
    let user: {
      id: number;
      fullName: string;
      email: string;
      phone: string | null;
      role: Role;
      createdAt: Date;
      updatedAt: Date;
    };

    if (exists && exists.emailVerifiedAt) {
      throw new BadRequestException('Account already exists and is already verified');
    }

    if (!exists) {
      user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          email: normalizedEmail,
          phone: dto.phone,
          password,
          role: (dto.role as Role) ?? 'CLIENT',
          emailVerifiedAt: now,
        },
        select: this.authUserResponseSelect,
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: exists.id },
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          password,
          emailVerifiedAt: now,
        },
        select: this.authUserResponseSelect,
      });
    }

    if (isDev) {
      console.log('[auth/register] created_user_email:', user.email);
      if (!String(password).startsWith('$2')) {
        console.warn('[auth/register] warning: stored password hash does not look like bcrypt');
      }
    }

    const accessToken = await this.issueAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashValue(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlSeconds() * 1000),
      },
    });

    return {
      token: accessToken,
      accessToken,
      refreshToken,
      user,
    };
  }

  async authenticateOAuthLogin(
    provider: 'google' | 'github',
    profile: any,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const now = new Date();
    const profileEmails = Array.isArray(profile?.emails) ? profile.emails : [];
    const verifiedEmail = profileEmails.find((entry: any) => entry?.value && entry?.verified !== false);
    const fallbackEmail = profileEmails.find((entry: any) => entry?.value);
    const providerEmail = this.normalizeEmail(verifiedEmail?.value || fallbackEmail?.value || '');

    if (!providerEmail) {
      throw new UnauthorizedException(`${provider} account does not provide an email`);
    }

    const firstName = profile?.name?.givenName ? String(profile.name.givenName).trim() : '';
    const lastName = profile?.name?.familyName ? String(profile.name.familyName).trim() : '';
    const displayName = String(profile?.displayName || '').trim();
    const fallbackName = providerEmail.split('@')[0] || 'OAuth User';
    const resolvedFullName = `${firstName} ${lastName}`.trim() || displayName || fallbackName;

    let user = await this.prisma.user.findUnique({ where: { email: providerEmail } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: providerEmail,
          fullName: resolvedFullName,
          password: await this.hashPassword(randomBytes(32).toString('hex')),
          role: 'CLIENT',
          emailVerifiedAt: now,
        },
      });
    } else if (!user.emailVerifiedAt) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now },
      });
    }

    const accessToken = await this.issueAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashValue(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlSeconds() * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  async login(dto: LoginDto) {
    const isDev = String(process.env.NODE_ENV || '').toLowerCase() !== 'production';
    console.log('[HIT] AuthService.login()', {
      email: dto?.email,
      hasPassword: Boolean(dto?.password),
    });

    try {
      const rawEmail = dto.email;
      const email = this.normalizeEmail(dto.email);
      if (isDev) {
        console.log('[auth/login] raw_email:', rawEmail);
        console.log('[auth/login] normalized_email:', email);
      }
      const result = await this.runLegacyLoginFlow(dto);
      if (isDev) {
        console.log('[auth/login] trace:', result.trace);
      }

      if (result.statusCode === 200) {
        return { token: result.token, user: result.user };
      }
      if (result.statusCode === 401) {
        throw new UnauthorizedException('Invalid credentials');
      }
      if (result.statusCode === 403) {
        const message = result.trace.errorMessageIfAny || 'Forbidden';
        throw new ForbiddenException(message);
      }
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    } catch (error) {
      if (isDev) {
        console.error('[auth/login] error:', error);
        if (error instanceof Error && error.stack) {
          console.error(error.stack);
        }
      }
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
