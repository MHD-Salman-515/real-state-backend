// import { Module } from '@nestjs/common';
// import { JwtModule } from '@nestjs/jwt';
// import { PassportModule } from '@nestjs/passport';
// import { AuthService } from './auth.service';
// import { AuthController } from './auth.controller';
// import { UsersModule } from '../users/users.module';
// import { JwtStrategy } from './jwt.strategy';
// import { JwtAuthGuard } from './guards/jwt-auth.guard';
// @Module({
//   imports: [
//     PassportModule.register({ defaultStrategy: 'jwt' }),
//     JwtModule.register({
//       secret: process.env.JWT_SECRET || 'dev-secret',
//       signOptions: { expiresIn: '7d' },
//     }),
//   ],
//   providers: [AuthService, JwtStrategy, JwtAuthGuard],
//   controllers: [AuthController],
//   exports: [JwtAuthGuard],
// })
// export class AuthModule {}


// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController, OwnerAuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { GoogleStrategy } from './google.strategy';
import { GithubStrategy } from './github.strategy';
import { AuthHitsService } from './auth-hits.service';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'dev-access-secret',
      signOptions: { expiresIn: Number(process.env.ACCESS_TOKEN_TTL ?? 900) },
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    GithubStrategy,
    AuthHitsService,
    JwtAuthGuard,
    // لو حابة تخلي JWT guard global:
    // { provide: APP_GUARD, useClass: JwtAuthGuard },
    // ولو حابة كمان تخلي RolesGuard global فوقه:
    // { provide: APP_GUARD, useClass: RolesGuard },
  ],
  controllers: [AuthController, OwnerAuthController],
  exports: [JwtAuthGuard, AuthHitsService],
})
export class AuthModule {}
