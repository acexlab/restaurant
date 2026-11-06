import { Body, Controller, Get, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { AuthUser, CorrelationId, CurrentUser, Tenant, TenantContext } from '../../common/context';
import { httpError, indianMobile, parse } from '../../common/http';
import { config } from '../../config';
import { OutboxService } from '../../integration-engine/outbox.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlatformAdminGuard } from '../identity/auth.guards';
import { TenantScoped } from '../tenancy/tenant.guard';
import { provisionTenant } from './provision';

const slug = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/, 'lowercase letters, digits and hyphens');
const gstin = z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'invalid GSTIN');

const CreateTenantSchema = z.object({
  slug,
  name: z.string().min(2).max(120),
  legalName: z.string().max(200).optional(),
  gstin: gstin.optional(),
  ownerEmail: z.string().email().toLowerCase(),
  /** Required only when the owner has no Xeva account yet. */
  ownerName: z.string().min(2).max(120).optional(),
  planCode: z.string().optional(),
  firstBranch: z.object({
    code: z.string().min(1).max(20),
    name: z.string().min(1).max(120),
    city: z.string().max(80).optional(),
    address: z.string().max(300).optional(),
    phone: indianMobile.optional(),
  }),
});

const UpdateTenantSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  legalName: z.string().max(200).optional(),
  gstin: gstin.nullable().optional(),
  defaultLocale: z.enum(['en', 'ml']).optional(),
  branding: z
    .object({
      logoUrl: z.string().url().optional(),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      tagline: z.string().max(140).optional(),
    })
    .optional(),
});

const CreateBranchSchema = CreateTenantSchema.shape.firstBranch.extend({ gstin: gstin.optional() });

const SupportGrantSchema = z.object({
  reason: z.string().min(10).max(500),
  hours: z.number().min(0.25).max(config.supportGrantMaxHours).default(1),
});

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // ─── Xeva Super Admin ───

  /** Restaurant onboarding: only Xeva admins create tenants (control matrix, spec 16). */
  @Post()
  @UseGuards(PlatformAdminGuard)
  async create(@CurrentUser() user: AuthUser, @CorrelationId() correlationId: string, @Body() body: unknown) {
    const input = parse(CreateTenantSchema, body);
    const existingOwner = await this.prisma.platformUser.findUnique({ where: { email: input.ownerEmail } });
    if (!existingOwner && !input.ownerName) {
      throw httpError(HttpStatus.UNPROCESSABLE_ENTITY, 'OWNER_NOT_FOUND', 'No Xeva account for this email: provide ownerName to create one');
    }
    const plan = input.planCode ? await this.prisma.subscriptionPlan.findUnique({ where: { code: input.planCode } }) : null;
    if (input.planCode && !plan?.isActive) throw httpError(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN_NOT_FOUND', 'Unknown or inactive plan');

    // shortcut: temporary password shown once to the Xeva admin; replace with an emailed invite / OTP before production.
    const temporaryPassword = existingOwner ? null : randomBytes(12).toString('base64url');

    try {
      return await this.prisma.withSystem(async (tx) => {
        const owner =
          existingOwner ??
          (await tx.platformUser.create({
            data: { email: input.ownerEmail, fullName: input.ownerName!, passwordHash: await bcrypt.hash(temporaryPassword!, 10) },
          }));
        const result = await provisionTenant(tx, {
          slug: input.slug,
          name: input.name,
          legalName: input.legalName,
          gstin: input.gstin,
          firstBranch: input.firstBranch,
          owner: { platformUserId: owner.id, displayName: owner.fullName },
        });
        await this.audit.recordPlatform(tx, { userId: user.userId, correlationId }, {
          tenantId: result.tenant.id,
          action: 'tenant.created',
          entityType: 'Tenant',
          entityId: result.tenant.id,
          after: result.tenant,
        });
        await this.outbox.publish(tx, { tenantId: result.tenant.id, correlationId }, {
          eventName: 'tenant.created',
          sourceModule: 'platform',
          entityId: result.tenant.id,
          payload: { slug: result.tenant.slug, name: result.tenant.name },
        });
        const subscription = plan
          ? await tx.subscription.create({
              data: {
                tenantId: result.tenant.id,
                planId: plan.id,
                status: 'TRIAL',
                currentPeriodStart: new Date(),
                currentPeriodEnd: new Date(Date.now() + plan.trialDays * 86400_000),
                trialEndsAt: new Date(Date.now() + plan.trialDays * 86400_000),
              },
            })
          : null;
        return {
          tenant: result.tenant,
          branch: result.branch,
          ownerEmployeeId: result.owner.id,
          subscription,
          ownerTemporaryPassword: temporaryPassword,
        };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw httpError(HttpStatus.CONFLICT, 'SLUG_TAKEN', 'A restaurant with this slug already exists');
      }
      throw err;
    }
  }

  /** Platform overview list of restaurant accounts. Tenant table is platform-level (no RLS). */
  @Get()
  @UseGuards(PlatformAdminGuard)
  list() {
    return this.prisma.tenant.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true, name: true, status: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Time-limited, audited support access for a Xeva admin to one restaurant (spec 4.4). */
  @Post(':tenantId/support-access')
  @UseGuards(PlatformAdminGuard)
  async grantSupportAccess(
    @CurrentUser() user: AuthUser,
    @CorrelationId() correlationId: string,
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
  ) {
    const input = parse(SupportGrantSchema, body);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw httpError(HttpStatus.NOT_FOUND, 'TENANT_NOT_FOUND', 'Restaurant not found');
    return this.prisma.withSystem(async (tx) => {
      const grant = await tx.supportAccessGrant.create({
        data: {
          tenantId,
          platformUserId: user.userId,
          grantedById: user.userId,
          reason: input.reason,
          expiresAt: new Date(Date.now() + input.hours * 3600_000),
        },
      });
      await this.audit.recordPlatform(tx, { userId: user.userId, correlationId }, {
        tenantId,
        action: 'support_access.granted',
        entityType: 'SupportAccessGrant',
        entityId: grant.id,
        after: grant,
      });
      return grant;
    });
  }

  // ─── Restaurant Admin ───

  @Get(':tenantId')
  @TenantScoped('tenant.view')
  get(@Tenant() ctx: TenantContext) {
    return this.prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
  }

  @Patch(':tenantId')
  @TenantScoped('tenant.manage')
  async update(@Tenant() ctx: TenantContext, @Body() body: unknown) {
    const input = parse(UpdateTenantSchema, body);
    return this.prisma.withTenant(ctx, async (tx) => {
      const before = await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
      const after = await tx.tenant.update({
        where: { id: ctx.tenantId },
        data: {
          ...input,
          ...(input.branding
            ? { branding: { ...(before.branding as object), ...input.branding } as Prisma.InputJsonValue }
            : {}),
        },
      });
      await this.audit.record(tx, ctx, { action: 'tenant.updated', entityType: 'Tenant', entityId: ctx.tenantId, before, after });
      return after;
    });
  }

  @Get(':tenantId/subscription')
  @TenantScoped('subscriptions.manage')
  subscription(@Tenant() ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.subscription.findFirst({ where: { tenantId: ctx.tenantId }, include: { plan: true }, orderBy: { createdAt: 'desc' } }),
    );
  }

  @Get(':tenantId/branches')
  @TenantScoped('branches.view')
  branches(@Tenant() ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.branch.findMany({ where: { tenantId: ctx.tenantId, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
    );
  }

  @Post(':tenantId/branches')
  @TenantScoped('branches.manage')
  async createBranch(@Tenant() ctx: TenantContext, @Body() body: unknown) {
    const input = parse(CreateBranchSchema, body);
    return this.prisma.withTenant(ctx, async (tx) => {
      const exists = await tx.branch.findUnique({ where: { tenantId_code: { tenantId: ctx.tenantId, code: input.code } } });
      if (exists) throw httpError(HttpStatus.CONFLICT, 'BRANCH_CODE_TAKEN', 'A branch with this code already exists');
      const branch = await tx.branch.create({ data: { tenantId: ctx.tenantId, ...input } });
      await this.audit.record(tx, ctx, { action: 'branch.created', entityType: 'Branch', entityId: branch.id, after: branch });
      return branch;
    });
  }
}
