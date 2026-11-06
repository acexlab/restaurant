import { Body, Controller, Get, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { hasPermission } from '@xeva/contracts';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { Tenant, TenantContext } from '../../common/context';
import { httpError, parse } from '../../common/http';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantScoped } from '../tenancy/tenant.guard';

const AddSchema = z.object({
  email: z.string().email().toLowerCase(),
  fullName: z.string().min(2).max(120),
  roleKey: z.string().min(1),
  /** Omit for a tenant-wide role. */
  branchId: z.string().uuid().optional(),
});

const UpdateSchema = z
  .object({
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
    /** Replaces the employee's tenant-wide roles. */
    roleKeys: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((v) => v.status || v.roleKeys, 'Provide status or roleKeys');

/** Restaurant team management (spec 4.3, control matrix 16). */
@Controller('tenants/:tenantId')
export class EmployeesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('roles')
  @TenantScoped('employees.view')
  roles(@Tenant() ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.role.findMany({
        where: { tenantId: ctx.tenantId },
        include: { permissions: { select: { permissionKey: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  @Get('employees')
  @TenantScoped('employees.view')
  async list(@Tenant() ctx: TenantContext) {
    const employees = await this.prisma.withTenant(ctx, (tx) =>
      tx.employee.findMany({
        where: { tenantId: ctx.tenantId, deletedAt: null },
        include: { user: { select: { email: true } }, roles: { include: { role: { select: { key: true, name: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return employees.map((e) => ({
      id: e.id,
      displayName: e.displayName,
      email: e.user.email,
      status: e.status,
      createdAt: e.createdAt,
      roles: e.roles.map((r) => ({ key: r.role.key, name: r.role.name, branchId: r.branchId })),
    }));
  }

  @Post('employees')
  @TenantScoped('employees.manage')
  async add(@Tenant() ctx: TenantContext, @Body() body: unknown) {
    const input = parse(AddSchema, body);
    const existingUser = await this.prisma.platformUser.findUnique({ where: { email: input.email } });
    // shortcut: temporary password returned once to the manager; replace with an emailed invite / OTP before production.
    const temporaryPassword = existingUser ? null : randomBytes(12).toString('base64url');
    const passwordHash = temporaryPassword ? await bcrypt.hash(temporaryPassword, 10) : null;

    return this.prisma.withTenant(ctx, async (tx) => {
      const role = await this.grantableRole(tx, ctx, input.roleKey);
      if (input.branchId) {
        const branch = await tx.branch.findFirst({ where: { id: input.branchId, tenantId: ctx.tenantId, deletedAt: null } });
        if (!branch) throw httpError(HttpStatus.BAD_REQUEST, 'INVALID_BRANCH', 'Branch not found');
      }
      if (existingUser) {
        const already = await tx.employee.findUnique({
          where: { tenantId_platformUserId: { tenantId: ctx.tenantId, platformUserId: existingUser.id } },
        });
        if (already) throw httpError(HttpStatus.CONFLICT, 'EMPLOYEE_EXISTS', 'This person is already on the team');
      }
      // platform_users is platform-level (no RLS), so creating it inside the tenant transaction keeps both atomic.
      const user = existingUser ?? (await tx.platformUser.create({ data: { email: input.email, fullName: input.fullName, passwordHash: passwordHash! } }));
      const employee = await tx.employee.create({
        data: {
          tenantId: ctx.tenantId,
          platformUserId: user.id,
          displayName: input.fullName,
          roles: { create: [{ tenantId: ctx.tenantId, roleId: role.id, branchId: input.branchId ?? null }] },
        },
      });
      await this.audit.record(tx, ctx, {
        action: 'employee.added',
        entityType: 'Employee',
        entityId: employee.id,
        after: { email: input.email, role: role.key, branchId: input.branchId ?? null },
      });
      return { id: employee.id, displayName: employee.displayName, email: user.email, temporaryPassword };
    });
  }

  @Patch('employees/:employeeId')
  @TenantScoped('employees.manage')
  async update(@Tenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() body: unknown) {
    const input = parse(UpdateSchema, body);
    return this.prisma.withTenant(ctx, async (tx) => {
      const employee = await tx.employee.findFirst({
        where: { id: employeeId, tenantId: ctx.tenantId, deletedAt: null },
        include: { roles: { include: { role: { include: { permissions: true } } } } },
      });
      if (!employee) throw httpError(HttpStatus.NOT_FOUND, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
      if (employee.id === ctx.employeeId) {
        throw httpError(HttpStatus.CONFLICT, 'CANNOT_CHANGE_SELF', 'You cannot change your own status or roles');
      }
      // Changing someone who holds more power than you would be an escalation path.
      for (const er of employee.roles) await this.grantableRole(tx, ctx, er.role.key);

      if (input.roleKeys) {
        const roles = [];
        for (const key of input.roleKeys) roles.push(await this.grantableRole(tx, ctx, key));
        await tx.employeeRole.deleteMany({ where: { employeeId, branchId: null } });
        await tx.employeeRole.createMany({
          data: roles.map((r) => ({ tenantId: ctx.tenantId, employeeId, roleId: r.id, branchId: null })),
        });
      }
      if (input.status) await tx.employee.update({ where: { id: employeeId }, data: { status: input.status } });

      await this.audit.record(tx, ctx, {
        action: 'employee.updated',
        entityType: 'Employee',
        entityId: employeeId,
        before: { status: employee.status, roles: employee.roles.map((r) => r.role.key) },
        after: input,
      });
      return { id: employeeId, ...input };
    });
  }

  /** A role can only be granted (or touched) by someone who already holds every permission it carries. */
  private async grantableRole(tx: Tx, ctx: TenantContext, roleKey: string) {
    const role = await tx.role.findUnique({
      where: { tenantId_key: { tenantId: ctx.tenantId, key: roleKey } },
      include: { permissions: true },
    });
    if (!role) throw httpError(HttpStatus.BAD_REQUEST, 'UNKNOWN_ROLE', `Unknown role ${roleKey}`);
    const missing = role.permissions.filter((p) => !hasPermission(ctx.permissions, p.permissionKey));
    if (missing.length) {
      throw httpError(HttpStatus.FORBIDDEN, 'ROLE_EXCEEDS_YOUR_ACCESS', `You cannot assign the ${role.name} role`);
    }
    return role;
  }
}
