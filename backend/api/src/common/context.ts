import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  userId: string;
  isPlatformAdmin: boolean;
}

/** Resolved by TenantGuard from the authenticated session — never taken on trust from the client. */
export interface TenantContext {
  tenantId: string;
  branchId: string | null;
  userId: string;
  /** null when a platform admin acts through a support grant. */
  employeeId: string | null;
  actorType: 'EMPLOYEE' | 'PLATFORM_ADMIN';
  permissions: Set<string>;
  correlationId: string;
}

export interface XevaRequest extends Request {
  user?: AuthUser;
  tenantCtx?: TenantContext;
  correlationId: string;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<XevaRequest>().user!;
});

export const Tenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const req = ctx.switchToHttp().getRequest<XevaRequest>();
  if (!req.tenantCtx) throw new Error('Tenant context missing: add @TenantScoped() to the route');
  return req.tenantCtx;
});

export const CorrelationId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<XevaRequest>().correlationId;
});
