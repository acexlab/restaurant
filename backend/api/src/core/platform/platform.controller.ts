import { Body, Controller, Get, HttpStatus, Param, ParseUUIDPipe, Patch, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CorrelationId, CurrentUser } from '../../common/context';
import { httpError, parse } from '../../common/http';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlatformAdminGuard } from '../identity/auth.guards';

const SubscriptionSchema = z.object({
  planCode: z.string().min(1),
  status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'GRACE', 'SUSPENDED', 'CANCELLED']),
  periodDays: z.number().int().min(1).max(400).default(30),
});
const TenantStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'CLOSED']) });
const EventsQuery = z.object({ status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER']).optional() });
const AuditQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) });

/**
 * Xeva Super Admin (spec 4.4). Commercial and platform-health data only: restaurant
 * operational data (orders, customers…) still requires a support grant via TenantGuard.
 * Every query runs in system context because it spans tenants.
 */
@Controller('platform')
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('overview')
  overview() {
    return this.prisma.withSystem(async (tx) => {
      const since = new Date(Date.now() - 86400_000);
      const [tenants, subscriptions, deadLetters, events24h, installs] = await Promise.all([
        tx.tenant.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
        tx.subscription.groupBy({ by: ['status'], _count: true }),
        tx.eventDelivery.count({ where: { status: 'DEAD_LETTER' } }),
        tx.outboxEvent.count({ where: { occurredAt: { gte: since } } }),
        tx.moduleInstallation.groupBy({ by: ['moduleId'], where: { status: 'ACTIVE' }, _count: true }),
      ]);
      const counts = (rows: { _count: number }[], key: string) =>
        Object.fromEntries(rows.map((r) => [(r as unknown as Record<string, string>)[key], r._count]));
      return {
        tenantsByStatus: counts(tenants, 'status'),
        subscriptionsByStatus: counts(subscriptions, 'status'),
        activeInstallsByModule: counts(installs, 'moduleId'),
        deadLetters,
        events24h,
      };
    });
  }

  @Get('plans')
  plans() {
    return this.prisma.subscriptionPlan.findMany({ orderBy: { priceInPaise: 'asc' } });
  }

  @Get('tenants/:tenantId')
  tenant(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.prisma.withSystem(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw httpError(HttpStatus.NOT_FOUND, 'TENANT_NOT_FOUND', 'Restaurant not found');
      const [branches, subscriptions, installations, employeeCount, grants] = await Promise.all([
        tx.branch.findMany({ where: { tenantId, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
        tx.subscription.findMany({ where: { tenantId }, include: { plan: true }, orderBy: { createdAt: 'desc' } }),
        tx.moduleInstallation.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
        tx.employee.count({ where: { tenantId, deletedAt: null } }),
        tx.supportAccessGrant.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      ]);
      return { tenant, branches, subscriptions, installations, employeeCount, supportGrants: grants };
    });
  }

  @Patch('tenants/:tenantId')
  setTenantStatus(
    @CurrentUser() user: AuthUser,
    @CorrelationId() correlationId: string,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: unknown,
  ) {
    const { status } = parse(TenantStatusSchema, body);
    return this.prisma.withSystem(async (tx) => {
      const before = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!before) throw httpError(HttpStatus.NOT_FOUND, 'TENANT_NOT_FOUND', 'Restaurant not found');
      const after = await tx.tenant.update({ where: { id: tenantId }, data: { status } });
      await this.audit.recordPlatform(tx, { userId: user.userId, correlationId }, {
        tenantId,
        action: 'tenant.status_changed',
        entityType: 'Tenant',
        entityId: tenantId,
        before: { status: before.status },
        after: { status },
      });
      return after;
    });
  }

  /** Assign or change a restaurant's plan. Updates the latest subscription, or creates one. */
  @Put('tenants/:tenantId/subscription')
  setSubscription(
    @CurrentUser() user: AuthUser,
    @CorrelationId() correlationId: string,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: unknown,
  ) {
    const input = parse(SubscriptionSchema, body);
    return this.prisma.withSystem(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw httpError(HttpStatus.NOT_FOUND, 'TENANT_NOT_FOUND', 'Restaurant not found');
      const plan = await tx.subscriptionPlan.findUnique({ where: { code: input.planCode } });
      if (!plan?.isActive) throw httpError(HttpStatus.UNPROCESSABLE_ENTITY, 'PLAN_NOT_FOUND', 'Unknown or inactive plan');

      const current = await tx.subscription.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
      const now = new Date();
      const period = { currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + input.periodDays * 86400_000) };
      const after = current
        ? await tx.subscription.update({
            where: { id: current.id },
            data: { planId: plan.id, status: input.status, ...(current.planId !== plan.id ? period : {}) },
            include: { plan: true },
          })
        : await tx.subscription.create({ data: { tenantId, planId: plan.id, status: input.status, ...period }, include: { plan: true } });

      await this.audit.recordPlatform(tx, { userId: user.userId, correlationId }, {
        tenantId,
        action: current ? 'subscription.changed' : 'subscription.created',
        entityType: 'Subscription',
        entityId: after.id,
        before: current ? { planId: current.planId, status: current.status } : null,
        after: { planCode: plan.code, status: input.status },
      });
      return after;
    });
  }

  /** Integration monitoring across every restaurant. */
  @Get('integration-events')
  async events(@Query() query: unknown) {
    const { status } = parse(EventsQuery, query);
    const deliveries = await this.prisma.withSystem((tx) =>
      tx.eventDelivery.findMany({
        where: status ? { status } : {},
        include: { event: { select: { eventName: true, sourceModule: true, entityId: true, occurredAt: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
    );
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: [...new Set(deliveries.map((d) => d.tenantId))] } },
      select: { id: true, name: true },
    });
    const names = new Map(tenants.map((t) => [t.id, t.name]));
    return deliveries.map((d) => ({ ...d, tenantName: names.get(d.tenantId) ?? d.tenantId }));
  }

  @Get('audit-logs')
  auditLogs(@Query() query: unknown) {
    const { limit } = parse(AuditQuery, query);
    return this.prisma.withSystem((tx) => tx.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit }));
  }
}
