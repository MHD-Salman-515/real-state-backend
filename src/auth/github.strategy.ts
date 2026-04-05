import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { AuthService } from './auth.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: process.env.GITHUB_CLIENT_ID || 'disabled-github-client-id',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || 'disabled-github-client-secret',
      callbackURL: `${process.env.OAUTH_CALLBACK_BASE || 'http://localhost:3000'}/api/auth/oauth/github/callback`,
      scope: ['user:email'],
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: any) {
    return this.authService.authenticateOAuthLogin('github', profile);
  }
}
