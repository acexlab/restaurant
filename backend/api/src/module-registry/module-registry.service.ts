import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { findModule, MODULE_TRANSITIONS, ModuleDefinition, ModuleStatus } from '@xeva/contracts';
import type { TenantContext } from '../common/context';
import { httpError } from '../common/http';
import { AuditService } from '../core/audit/audit.service';
import { OutboxService } from '../integration-engine/outbox.service';
import { PrismaService, Tx } from '../prisma/prisma.service';

const COVERING_SUBSCRIPTION = ['TRIAL', 'ACTIVE', 'GRACE'] as const;

/** Effective value of one feature flag: the tenant's stored override, else the catalogue default. */
export async function isFeatureEnabled(tx: Tx, tenantId: string, moduleId: string, featureKey: string) {
  const flag = await tx.featureFlag.findUnique({ where: { tenantId_moduleId_featureKey: { tenantId, moduleId, featureKey } } });
  return flag ? flag.enabled : (findModule(moduleId)?.features.find((f) => f.key === featureKey)?.defaultEnabled ?? false);
}

/**
 * Module registry and activation engine (spec 6).
 * Nothing in the platform assumes which modules a restaurant has: it always asks this service.
 */
@Injectable()
export class ModuleRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  catalog() {
    return this.prisma.productModule.findMany({ orderBy: { id: 'asc' } });
  }

  /** Installed modules with their effective feature flags (stored overrides on top of defaults). */
  async installed(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [installs, flags, configs] = await Promise.all([
        tx.moduleInstallation.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'asc' } }),
        tx.featureFlag.findMany({ where: { tenantId: ctx.tenantId } }),
        tx.moduleConfiguration.findMany({ where: { tenantId: ctx.tenantId } }),
      ]);
      return installs.map((inst) => {
        const def = findModule(inst.moduleId);
        const features: Record<string, boolean> = {};
        for (const f of def?.features ?? []) features[f.key] = f.defaultEnabled;
        for (const fl of flags.filter((x) => x.moduleId === inst.moduleId)) features[fl.featureKey] = fl.enabled;
        return {
          ...inst,
          name: def?.name ?? inst.moduleId,
          features,
          configuration: configs.find((c) => c.moduleId === inst.moduleId)?.config ?? {},
        };
      });
    });
  }

  /** Purchase + activate. Reactivating an INACTIVE module keeps its earlier configuration. */
  async activate(ctx: TenantContext, moduleId: string) {
    const def = this.requireDefinition(moduleId);
    if (def.availability === 'planned') {
      throw httpError(HttpStatus.CONFLICT, 'MODULE_NOT_AVAILABLE', `${def.name} is not available yet`);
    }

    return this.prisma.withTenant(ctx, async (tx) => {
      await this.requireEntitlement(tx, ctx, moduleId);
      for (const dep of def.dependencies) {
        const d = await this.installation(tx, ctx.tenantId, dep);
        if (d?.status !== 'ACTIVE') {
          throw httpError(HttpStatus.CONFLICT, 'DEPENDENCY_NOT_ACTIVE', `${def.name} requires ${dep} to be active`);
        }
      }

      const existing = await this.installation(tx, ctx.tenantId, moduleId);
      if (existing?.status === 'ACTIVE') {
        throw httpError(HttpStatus.CONFLICT, 'MODULE_ALREADY_ACTIVE', `${def.name} is already active`);
      }
      if (existing && !MODULE_TRANSITIONS[existing.status as ModuleStatus].includes('ACTIVE')) {
        throw httpError(HttpStatus.CONFLICT, 'INVALID_TRANSITION', `Cannot activate a module that is ${existing.status}`);
      }

      const installation = existing
        ? await tx.moduleInstallation.update({
            where: { id: existing.id },
            data: { status: 'ACTIVE', activatedAt: new Date(), deactivatedAt: null, version: def.version },
          })
        : await tx.moduleInstallation.create({
            data: { tenantId: ctx.tenantId, moduleId, status: 'ACTIVE', version: def.version, activatedAt: new Date() },
          });

      // Defaults only for first activation; existing rows are left untouched (restore on reactivation).
      await tx.moduleConfiguration.upsert({
        where: { tenantId_moduleId: { tenantId: ctx.tenantId, moduleId } },
        create: { tenantId: ctx.tenantId, moduleId, config: def.defaultConfiguration as Prisma.InputJsonValue },
        update: {},
      });
      await tx.featureFlag.createMany({
        data: def.features.map((f) => ({ tenantId: ctx.tenantId, moduleId, featureKey: f.key, enabled: f.defaultEnabled })),
        skipDuplicates: true,
      });

      await this.audit.record(tx, ctx, {
        action: existing ? 'module.reactivated' : 'module.activated',
        entityType: 'ModuleInstallation',
        entityId: installation.id,
        before: existing ? { status: existing.status } : null,
        after: { status: 'ACTIVE', version: def.version },
      });
      await this.outbox.publish(tx, ctx, {
        eventName: 'module.activated',
        sourceModule: 'platform',
        entityId: installation.id,
        payload: { moduleId, version: def.version, reactivated: Boolean(existing) },
      });
      return installation;
    });
  }

  async changeStatus(ctx: TenantContext, moduleId: string, status: ModuleStatus) {
    this.requireDefinition(moduleId);
    return this.prisma.withTenant(ctx, async (tx) => {
      const existing = await this.installation(tx, ctx.tenantId, moduleId);
      if (!existing) throw httpError(HttpStatus.NOT_FOUND, 'MODULE_NOT_INSTALLED', `${moduleId} is not installed`);
      if (status === 'ACTIVE') {
        throw httpError(HttpStatus.BAD_REQUEST, 'USE_ACTIVATE', 'Use POST /tenants/:tenantId/modules to activate');
      }
      if (!MODULE_TRANSITIONS[existing.status as ModuleStatus].includes(status)) {
        throw httpError(HttpStatus.CONFLICT, 'INVALID_TRANSITION', `Cannot move from ${existing.status} to ${status}`);
      }
      // Deactivation keeps all history, configuration and flags (spec 6.2).
      const after = await tx.moduleInstallation.update({
        where: { id: existing.id },
        data: { status, ...(status === 'INACTIVE' ? { deactivatedAt: new Date() } : {}) },
      });
      await this.audit.record(tx, ctx, {
        action: 'module.status_changed',
        entityType: 'ModuleInstallation',
        entityId: existing.id,
        before: { status: existing.status },
        after: { status },
      });
      await this.outbox.publish(tx, ctx, {
        eventName: 'module.status_changed',
        sourceModule: 'platform',
        entityId: existing.id,
        payload: { moduleId, from: existing.status, to: status },
      });
      return after;
    });
  }

  async setFeatures(ctx: TenantContext, moduleId: string, features: Record<string, boolean>) {
    const def = this.requireDefinition(moduleId);
    const unknown = Object.keys(features).filter((k) => !def.features.some((f) => f.key === k));
    if (unknown.length) {
      throw httpError(HttpStatus.BAD_REQUEST, 'UNKNOWN_FEATURE', `Unknown features for ${moduleId}: ${unknown.join(', ')}`);
    }
    return this.prisma.withTenant(ctx, async (tx) => {
      const inst = await this.installation(tx, ctx.tenantId, moduleId);
      if (!inst) throw httpError(HttpStatus.NOT_FOUND, 'MODULE_NOT_INSTALLED', `${moduleId} is not installed`);
      const before = await tx.featureFlag.findMany({ where: { tenantId: ctx.tenantId, moduleId } });
      for (const [featureKey, enabled] of Object.entries(features)) {
        await tx.featureFlag.upsert({
          where: { tenantId_moduleId_featureKey: { tenantId: ctx.tenantId, moduleId, featureKey } },
          create: { tenantId: ctx.tenantId, moduleId, featureKey, enabled, updatedById: ctx.userId },
          update: { enabled, updatedById: ctx.userId },
        });
      }
      await this.audit.record(tx, ctx, {
        action: 'module.features_changed',
        entityType: 'ModuleInstallation',
        entityId: inst.id,
        before: Object.fromEntries(before.map((f) => [f.featureKey, f.enabled])),
        after: features,
      });
      await this.outbox.publish(tx, ctx, {
        eventName: 'module.features_changed',
        sourceModule: 'platform',
        entityId: inst.id,
        payload: { moduleId, features },
      });
      return { moduleId, features };
    });
  }

  /** Active module IDs for navigation and other module-aware UI (spec 4.2). */
  async activeModuleIds(ctx: TenantContext): Promise<string[]> {
    const rows = await this.prisma.withTenant(ctx, (tx) =>
      tx.moduleInstallation.findMany({ where: { tenantId: ctx.tenantId, status: 'ACTIVE' }, select: { moduleId: true } }),
    );
    return rows.map((r) => r.moduleId);
  }

  private requireDefinition(moduleId: string): ModuleDefinition {
    const def = findModule(moduleId);
    if (!def) throw httpError(HttpStatus.NOT_FOUND, 'MODULE_NOT_FOUND', `Unknown module ${moduleId}`);
    return def;
  }

  private installation(tx: Tx, tenantId: string, moduleId: string) {
    return tx.moduleInstallation.findUnique({ where: { tenantId_moduleId: { tenantId, moduleId } } });
  }

  /** Commercial check: the tenant's current subscription plan must include the module. */
  private async requireEntitlement(tx: Tx, ctx: TenantContext, moduleId: string) {
    if (ctx.actorType === 'PLATFORM_ADMIN') return; // audited support action
    const subs = await tx.subscription.findMany({
      where: { tenantId: ctx.tenantId, status: { in: [...COVERING_SUBSCRIPTION] } },
      include: { plan: true },
    });
    if (!subs.some((s) => s.plan.moduleIds.includes(moduleId))) {
      throw httpError(HttpStatus.PAYMENT_REQUIRED, 'MODULE_NOT_IN_PLAN', `Your subscription does not include ${moduleId}`);
    }
  }
}
