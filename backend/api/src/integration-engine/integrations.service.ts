import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventName, findModule } from '@xeva/contracts';
import type { TenantContext } from '../common/context';
import { httpError } from '../common/http';
import { AuditService } from '../core/audit/audit.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { OutboxService } from './outbox.service';

export interface CreateIntegrationInput {
  sourceModule: string;
  destinationModule: string;
  type: 'AUTOMATIC' | 'CONFIGURABLE' | 'EXTERNAL';
  config: Record<string, unknown>;
  allowedEvents?: string[];
}

/** Integration Centre backend (spec 7.1–7.3). */
@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** Events that would flow from source to destination (what the source publishes and the destination consumes). */
  static compatibleEvents(sourceModule: string, destinationModule: string): EventName[] {
    const src = findModule(sourceModule);
    const dst = findModule(destinationModule);
    if (!src || !dst) return [];
    return src.publishes.filter((e) => dst.consumes.includes(e));
  }

  list(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.integration.findMany({ where: { tenantId: ctx.tenantId }, include: { permissions: true }, orderBy: { createdAt: 'asc' } }),
    );
  }

  async create(ctx: TenantContext, input: CreateIntegrationInput) {
    const flowing = IntegrationsService.compatibleEvents(input.sourceModule, input.destinationModule);
    if (!findModule(input.sourceModule) || !findModule(input.destinationModule)) {
      throw httpError(HttpStatus.BAD_REQUEST, 'UNKNOWN_MODULE', 'Source or destination module does not exist');
    }
    if (flowing.length === 0) {
      throw httpError(HttpStatus.UNPROCESSABLE_ENTITY, 'MODULES_NOT_COMPATIBLE',
        `${input.sourceModule} publishes no events that ${input.destinationModule} consumes`);
    }
    const invalid = (input.allowedEvents ?? []).filter((e) => !flowing.includes(e as EventName));
    if (invalid.length) {
      throw httpError(HttpStatus.BAD_REQUEST, 'INVALID_EVENTS', `Events not supported by this connection: ${invalid.join(', ')}`);
    }

    return this.prisma.withTenant(ctx, async (tx) => {
      await this.requireActive(tx, ctx.tenantId, input.sourceModule);
      await this.requireActive(tx, ctx.tenantId, input.destinationModule);

      const existing = await tx.integration.findUnique({
        where: {
          tenantId_sourceModule_destinationModule: {
            tenantId: ctx.tenantId,
            sourceModule: input.sourceModule,
            destinationModule: input.destinationModule,
          },
        },
      });
      if (existing) throw httpError(HttpStatus.CONFLICT, 'INTEGRATION_EXISTS', 'These modules are already connected');

      const integration = await tx.integration.create({
        data: {
          tenantId: ctx.tenantId,
          sourceModule: input.sourceModule,
          destinationModule: input.destinationModule,
          type: input.type,
          config: input.config as Prisma.InputJsonValue,
          createdById: ctx.userId,
          permissions: {
            create: (input.allowedEvents ?? []).map((eventName) => ({ tenantId: ctx.tenantId, eventName, allowed: true })),
          },
        },
        include: { permissions: true },
      });
      await this.audit.record(tx, ctx, { action: 'integration.created', entityType: 'Integration', entityId: integration.id, after: integration });
      await this.outbox.publish(tx, ctx, {
        eventName: 'integration.enabled',
        sourceModule: 'platform',
        entityId: integration.id,
        payload: { sourceModule: integration.sourceModule, destinationModule: integration.destinationModule },
      });
      return integration;
    });
  }

  async update(ctx: TenantContext, id: string, input: { config?: Record<string, unknown>; allowedEvents?: string[] }) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const before = await this.get(tx, ctx, id);
      if (input.allowedEvents) {
        const flowing = IntegrationsService.compatibleEvents(before.sourceModule, before.destinationModule);
        const invalid = input.allowedEvents.filter((e) => !flowing.includes(e as EventName));
        if (invalid.length) {
          throw httpError(HttpStatus.BAD_REQUEST, 'INVALID_EVENTS', `Events not supported by this connection: ${invalid.join(', ')}`);
        }
        await tx.integrationPermission.deleteMany({ where: { integrationId: id } });
        await tx.integrationPermission.createMany({
          data: input.allowedEvents.map((eventName) => ({ tenantId: ctx.tenantId, integrationId: id, eventName, allowed: true })),
        });
      }
      const after = await tx.integration.update({
        where: { id },
        data: { ...(input.config ? { config: input.config as Prisma.InputJsonValue } : {}), version: { increment: 1 } },
        include: { permissions: true },
      });
      await this.audit.record(tx, ctx, { action: 'integration.updated', entityType: 'Integration', entityId: id, before, after });
      return after;
    });
  }

  async setStatus(ctx: TenantContext, id: string, status: 'ACTIVE' | 'DISABLED') {
    return this.prisma.withTenant(ctx, async (tx) => {
      const before = await this.get(tx, ctx, id);
      if (status === 'ACTIVE') {
        await this.requireActive(tx, ctx.tenantId, before.sourceModule);
        await this.requireActive(tx, ctx.tenantId, before.destinationModule);
      }
      const after = await tx.integration.update({ where: { id }, data: { status }, include: { permissions: true } });
      await this.audit.record(tx, ctx, {
        action: status === 'ACTIVE' ? 'integration.enabled' : 'integration.disabled',
        entityType: 'Integration',
        entityId: id,
        before: { status: before.status },
        after: { status },
      });
      await this.outbox.publish(tx, ctx, {
        eventName: status === 'ACTIVE' ? 'integration.enabled' : 'integration.disabled',
        sourceModule: 'platform',
        entityId: id,
        payload: { sourceModule: after.sourceModule, destinationModule: after.destinationModule },
      });
      return after;
    });
  }

  /** "Test connection" in the Integration Centre: checks everything an event needs to flow. */
  async test(ctx: TenantContext, id: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const integration = await this.get(tx, ctx, id);
      const [src, dst] = await Promise.all([
        tx.moduleInstallation.findUnique({ where: { tenantId_moduleId: { tenantId: ctx.tenantId, moduleId: integration.sourceModule } } }),
        tx.moduleInstallation.findUnique({ where: { tenantId_moduleId: { tenantId: ctx.tenantId, moduleId: integration.destinationModule } } }),
      ]);
      const compatible = IntegrationsService.compatibleEvents(integration.sourceModule, integration.destinationModule);
      const flowing = integration.permissions.length
        ? compatible.filter((e) => integration.permissions.some((p) => p.eventName === e && p.allowed))
        : compatible;
      const deadLetters = await tx.eventDelivery.count({ where: { integrationId: id, status: 'DEAD_LETTER' } });
      const checks = {
        sourceModuleActive: src?.status === 'ACTIVE',
        destinationModuleActive: dst?.status === 'ACTIVE',
        integrationActive: integration.status === 'ACTIVE',
        hasFlowingEvents: flowing.length > 0,
      };
      return {
        ok: Object.values(checks).every(Boolean),
        checks,
        flowingEvents: flowing,
        lastSuccessfulEventAt: integration.lastSuccessfulEventAt,
        errorCount: integration.errorCount,
        deadLetters,
      };
    });
  }

  events(ctx: TenantContext, id: string, status?: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      await this.get(tx, ctx, id);
      return tx.eventDelivery.findMany({
        where: { integrationId: id, ...(status ? { status: status as never } : {}) },
        include: { event: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });
  }

  listDeliveries(ctx: TenantContext, status?: string) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.eventDelivery.findMany({
        where: { tenantId: ctx.tenantId, ...(status ? { status: status as never } : {}) },
        include: { event: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  /** Failed-event replay (spec 7.5). Safe because consumers are idempotent. */
  async replay(ctx: TenantContext, deliveryId: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const delivery = await tx.eventDelivery.findFirst({ where: { id: deliveryId, tenantId: ctx.tenantId } });
      if (!delivery) throw httpError(HttpStatus.NOT_FOUND, 'DELIVERY_NOT_FOUND', 'Event delivery not found');
      if (delivery.status !== 'DEAD_LETTER' && delivery.status !== 'FAILED') {
        throw httpError(HttpStatus.CONFLICT, 'NOT_REPLAYABLE', `Delivery is ${delivery.status}; only failed or dead-lettered deliveries can be replayed`);
      }
      const after = await tx.eventDelivery.update({
        where: { id: deliveryId },
        data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: null },
      });
      await this.audit.record(tx, ctx, {
        action: 'event.replayed',
        entityType: 'EventDelivery',
        entityId: deliveryId,
        before: { status: delivery.status, attempts: delivery.attempts, lastError: delivery.lastError },
      });
      return after;
    });
  }

  private async get(tx: Tx, ctx: TenantContext, id: string) {
    const integration = await tx.integration.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { permissions: true } });
    if (!integration) throw httpError(HttpStatus.NOT_FOUND, 'INTEGRATION_NOT_FOUND', 'Integration not found');
    return integration;
  }

  private async requireActive(tx: Tx, tenantId: string, moduleId: string) {
    const inst = await tx.moduleInstallation.findUnique({ where: { tenantId_moduleId: { tenantId, moduleId } } });
    if (inst?.status !== 'ACTIVE') {
      throw httpError(HttpStatus.CONFLICT, 'MODULE_NOT_ACTIVE', `Module ${moduleId} is not active for this restaurant`);
    }
  }
}
