import { CanActivate, ExecutionContext, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { XevaRequest } from '../../common/context';
import { httpError } from '../../common/http';

const PUBLIC_KEY = 'xeva:public';
/** Marks a route as not requiring authentication. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export interface JwtPayload {
  sub: string;
  adm: boolean;
}

/** Global guard: every route requires a valid bearer token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<XevaRequest>();
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw httpError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Missing bearer token');
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      req.user = { userId: payload.sub, isPlatformAdmin: payload.adm === true };
      return true;
    } catch {
      throw httpError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Invalid or expired token');
    }
  }
}

/** Restricts a route to Xeva platform administrators. */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<XevaRequest>();
    if (!req.user?.isPlatformAdmin) {
      throw httpError(HttpStatus.FORBIDDEN, 'PLATFORM_ADMIN_REQUIRED', 'Xeva administrator access required');
    }
    return true;
  }
}
