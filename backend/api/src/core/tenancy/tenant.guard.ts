import { applyDecorators, CanActivate, ExecutionContext, HttpStatus, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALL, hasPermission } from '@xeva/contracts';
import type { TenantContext, XevaRequest } from '../../common/context';
import { httpError } from '../../common/http';
import { PrismaService } from '../../prisma/prisma.service';

const PERMISSIONS_KEY = 'xeva:permissions';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves and verifies the tenant (and optional branch) for a request, then checks permissions.
 *
 * The client says which tenant it wants (route :tenantId or the X-Xeva-Tenant header), but that
 * is only a selection: access is granted only if the authenticated user is an active employee of
 * that tenant, or a Xeva admin holding a live support grant (spec 5.2: never trust a client tenant ID).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<XevaRequest>();
    const user = req.user;
    if (!user) throw httpError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Authentication required');

    const rawPath = req.params?.tenantId as string | string[] | undefined;
    const fromPath = Array.isArray(rawPath) ? rawPath[0] : rawPath;
    const fromHeader = req.header('x-xeva-tenant');
    if (fromPath && fromHeader && fromPath !== fromHeader) {
      throw httpError(HttpStatus.BAD_REQUEST, 'TENANT_MISMATCH', 'Route tenant and X-Xeva-Tenant header differ');
    }
    const tenantId = fromPath ?? fromHeader;
    if (!tenantId || !UUID_RE.test(tenantId)) {
      throw httpError(HttpStatus.BAD_REQUEST, 'TENANT_REQUIRED', 'A valid tenant must be selected (X-Xeva-Tenant header)');
    }
    const branchId = req.header('x-xeva-branch') ?? null;
    if (branchId && !UUID_RE.test(branchId)) {
      throw httpError(HttpStatus.BAD_REQUEST, 'INVALID_BRANCH', 'X-Xeva-Branch must be a UUID');
    }

    const ctx = await this.prisma.withTenant({ tenantId, userId: user.userId }, async (tx) => {
      if (branchId) {
        const branch = await tx.branch.findFirst({ where: { id: branchId, tenantId, deletedAt: null, isActive: true } });
        if (!branch) return null;
      }

      const employee = await tx.employee.findFirst({
        where: { tenantId, platformUserId: user.userId, status: 'ACTIVE', deletedAt: null },
        include: { roles: { include: { role: { include: { permissions: true } } } } },
      });

      if (employee) {
        // Tenant-wide roles always apply; branch-scoped roles apply only to the selected branch.
        const applicable = employee.roles.filter((er) => er.branchId === null || er.branchId === branchId);
        if (branchId && applicable.length === 0) return null; // no access to this branch
        const permissions = new Set(applicable.flatMap((er) => er.role.permissions.map((p) => p.permissionKey)));
        return { employeeId: employee.id, actorType: 'EMPLOYEE' as const, permissions };
      }

      if (user.isPlatformAdmin) {
        const grant = await tx.supportAccessGrant.findFirst({
          where: { tenantId, platformUserId: user.userId, revokedAt: null, expiresAt: { gt: new Date() } },
        });
        if (grant) return { employeeId: null, actorType: 'PLATFORM_ADMIN' as const, permissions: new Set([ALL]) };
      }
      return null;
    });

    // Same response whether the tenant doesn't exist or the user isn't a member: don't leak existence.
    if (!ctx) throw httpError(HttpStatus.FORBIDDEN, 'TENANT_ACCESS_DENIED', 'You do not have access to this restaurant or branch');

    const tenantCtx: TenantContext = {
      tenantId,
      branchId,
      userId: user.userId,
      employeeId: ctx.employeeId,
      actorType: ctx.actorType,
      permissions: ctx.permissions,
      correlationId: req.correlationId,
    };
    req.tenantCtx = tenantCtx;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const missing = required.filter((p) => !hasPermission(tenantCtx.permissions, p));
    if (missing.length) {
      throw httpError(HttpStatus.FORBIDDEN, 'PERMISSION_DENIED', `Missing permission: ${missing.join(', ')}`);
    }

    const moduleId = this.reflector.getAllAndOverride<string>(MODULE_KEY, [context.getHandler(), context.getClass()]);
    if (moduleId) {
      const inst = await this.prisma.withTenant({ tenantId }, (tx) =>
        tx.moduleInstallation.findUnique({ where: { tenantId_moduleId: { tenantId, moduleId } } }),
      );
      if (inst?.status !== 'ACTIVE') {
        throw httpError(HttpStatus.FORBIDDEN, 'MODULE_NOT_ACTIVE', `The ${moduleId} product is not active for this restaurant`);
      }
    }
    return true;
  }
}

const MODULE_KEY = 'xeva:module';
/** Route belongs to a product module: it answers only while that module is ACTIVE for the tenant. */
export const ForModule = (moduleId: string) => SetMetadata(MODULE_KEY, moduleId);

/** Route runs in a verified tenant context and requires all listed permissions. */
export function TenantScoped(...permissions: string[]) {
  return applyDecorators(SetMetadata(PERMISSIONS_KEY, permissions), UseGuards(TenantGuard));
}
