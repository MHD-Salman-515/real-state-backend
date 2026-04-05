import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import { AuthService } from './auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'disabled-google-client-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'disabled-google-client-secret',
      callbackURL: `${process.env.OAUTH_CALLBACK_BASE || 'http://localhost:3000'}/api/auth/oauth/google/callback`,
      scope: ['profile', 'email'],
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: any) {
    return this.authService.authenticateOAuthLogin('google', profile);
  }
}
