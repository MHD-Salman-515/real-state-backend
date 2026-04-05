import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = { sub?: number; id?: number; role?: string }>(
    err: unknown,
    user: TUser,
  ): TUser | undefined {
    if (err || !user) {
      return undefined;
    }
    return user;
  }

  // Never block anonymous access for optional auth endpoints.
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    return true;
  }
}
