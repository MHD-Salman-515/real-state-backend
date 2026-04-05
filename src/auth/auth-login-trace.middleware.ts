import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuthHitsService } from './auth-hits.service';

@Injectable()
export class AuthLoginTraceMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AuthLoginTrace');

  constructor(private readonly authHits: AuthHitsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const body = (req.body || {}) as { email?: unknown; password?: unknown };
    const emailValue = typeof body.email === 'string' ? body.email : '';
    const passwordValue = typeof body.password === 'string' ? body.password : '';
    const hasEmail = emailValue.trim().length > 0;
    const passwordLength = passwordValue.length;

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const entry = {
        at: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl || req.url,
        ip: req.ip || req.socket.remoteAddress || 'unknown',
        userAgent: String(req.headers['user-agent'] || ''),
        contentType: String(req.headers['content-type'] || ''),
        contentLength: String(req.headers['content-length'] || ''),
        hasEmail,
        passwordLength,
        statusCode: res.statusCode,
        durationMs,
      };

      this.authHits.record(entry);
      this.logger.log(
        `${entry.method} ${entry.path} status=${entry.statusCode} ip=${entry.ip} ua="${entry.userAgent}" contentType="${entry.contentType}" contentLength="${entry.contentLength}" hasEmail=${entry.hasEmail} passwordLength=${entry.passwordLength} durationMs=${entry.durationMs}`,
      );
    });

    next();
  }
}
