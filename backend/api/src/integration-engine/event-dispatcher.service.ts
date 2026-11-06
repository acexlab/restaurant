import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { EventEnvelope, EventName, isEventName } from '@xeva/contracts';
import type { OutboxEvent } from '@prisma/client';
import { config } from '../config';
import { PrismaService, Tx } from '../prisma/prisma.service';

export interface EventConsumer {
  /** A module ID (e.g. "kitchen_display") or a core service name (e.g. "notification_service"). */
  name: string;
  /**
   * core: shared services, receive every subscribed event for every tenant.
   * module: receive events only when the module is ACTIVE for the tenant and an ACTIVE
   *         integration connects the event's source module to it (spec 7).
   */
  kind: 'core' | 'module';
  events: EventName[];
  /** Must be idempotent: delivery is at-least-once. */
  handle(event: EventEnvelope): Promise<void>;
}

export function toEnvelope(e: OutboxEvent): EventEnvelope {
  if (!isEventName(e.eventName)) throw new Error(`Unknown event ${e.eventName}`);
  return {
    eventId: e.id,
    eventName: e.eventName,
    schemaVersion: e.schemaVersion,
    tenantId: e.tenantId,
    branchId: e.branchId,
    sourceModule: e.sourceModule,
    entityId: e.entityId,
    occurredAt: e.occurredAt.toISOString(),
    correlationId: e.correlationId,
    payload: e.payload as Record<string, unknown>,
  };
}

/**
 * Two-stage dispatcher:
 *  1. fan-out: each PENDING outbox event becomes one EventDelivery per eligible consumer.
 *     The (eventId, consumer) unique key means re-running fan-out can never duplicate a delivery.
 *  2. delivery: due deliveries are handed to their consumer; failures retry with exponential
 *     backoff and move to DEAD_LETTER after maxDeliveryAttempts. Dead letters can be replayed.
 * Rows are claimed with FOR UPDATE SKIP LOCKED, so several API instances can run this safely.
 */
@Injectable()
export class EventDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('EventDispatcher');
  private readonly consumers = new Map<string, EventConsumer>();
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  subscribe(consumer: EventConsumer) {
    this.consumers.set(consumer.name, consumer);
  }

  unsubscribe(name: string) {
    this.consumers.delete(name);
  }

  onApplicationBootstrap() {
    if (config.outboxPollMs > 0) {
      this.timer = setInterval(() => void this.tick(), config.outboxPollMs);
    }
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.fanOut();
      await this.processDue();
    } catch (err) {
      this.logger.error(err instanceof Error ? err.stack : String(err));
    } finally {
      this.running = false;
    }
  }

  /** Run both stages until nothing is left to do (used by tests and admin tooling). */
  async drain(maxRounds = 25) {
    for (let i = 0; i < maxRounds; i++) {
      const work = (await this.fanOut()) + (await this.processDue());
      if (work === 0) return;
    }
  }

  /** Stage 1. Returns the number of events fanned out. */
  async fanOut(batchSize = 100): Promise<number> {
    return this.prisma.withSystem(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM outbox_events WHERE status = 'PENDING'
        ORDER BY "occurredAt" LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`;
      if (rows.length === 0) return 0;

      const events = await tx.outboxEvent.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
      for (const event of events) {
        const targets = await this.resolveTargets(tx, event);
        if (targets.length) {
          await tx.eventDelivery.createMany({
            data: targets.map((t) => ({
              tenantId: event.tenantId,
              eventId: event.id,
              consumer: t.consumer,
              integrationId: t.integrationId,
            })),
            skipDuplicates: true,
          });
        }
      }
      await tx.outboxEvent.updateMany({
        where: { id: { in: events.map((e) => e.id) } },
        data: { status: 'DISPATCHED', dispatchedAt: new Date() },
      });
      return events.length;
    });
  }

  private async resolveTargets(tx: Tx, event: OutboxEvent) {
    const targets: { consumer: string; integrationId: string | null }[] = [];
    for (const consumer of this.consumers.values()) {
      if (!consumer.events.includes(event.eventName as EventName)) continue;
      if (consumer.name === event.sourceModule) continue;

      if (consumer.kind === 'core') {
        targets.push({ consumer: consumer.name, integrationId: null });
        continue;
      }

      const installed = await tx.moduleInstallation.findUnique({
        where: { tenantId_moduleId: { tenantId: event.tenantId, moduleId: consumer.name } },
      });
      if (installed?.status !== 'ACTIVE') continue;

      const integration = await tx.integration.findUnique({
        where: {
          tenantId_sourceModule_destinationModule: {
            tenantId: event.tenantId,
            sourceModule: event.sourceModule,
            destinationModule: consumer.name,
          },
        },
        include: { permissions: true },
      });
      if (integration?.status !== 'ACTIVE') continue;
      if (!eventAllowed(integration.permissions, event.eventName)) continue;

      targets.push({ consumer: consumer.name, integrationId: integration.id });
    }
    return targets;
  }

  /** Stage 2. Returns the number of deliveries attempted. */
  async processDue(maxDeliveries = 100): Promise<number> {
    let processed = 0;
    while (processed < maxDeliveries) {
      const didWork = await this.prisma.withSystem(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM event_deliveries
          WHERE status IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= now()
          ORDER BY "nextAttemptAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
        if (rows.length === 0) return false;
        await this.deliver(tx, rows[0].id);
        return true;
      });
      if (!didWork) break;
      processed++;
    }
    return processed;
  }

  private async deliver(tx: Tx, deliveryId: string) {
    const delivery = await tx.eventDelivery.findUniqueOrThrow({ where: { id: deliveryId }, include: { event: true } });
    const consumer = this.consumers.get(delivery.consumer);
    const attempts = delivery.attempts + 1;

    // Integration permissions are re-checked at delivery time: disconnecting stops the flow
    // immediately, and parked deliveries can be replayed once it is reconnected.
    if (delivery.integrationId) {
      const integration = await tx.integration.findUnique({
        where: { id: delivery.integrationId },
        include: { permissions: true },
      });
      if (integration?.status !== 'ACTIVE' || !eventAllowed(integration.permissions, delivery.event.eventName)) {
        await tx.eventDelivery.update({
          where: { id: deliveryId },
          data: { status: 'DEAD_LETTER', attempts, lastError: 'Integration disabled or event no longer permitted' },
        });
        return;
      }
    }

    try {
      if (!consumer) throw new Error(`No consumer registered as "${delivery.consumer}"`);
      await consumer.handle(toEnvelope(delivery.event));
      await tx.eventDelivery.update({
        where: { id: deliveryId },
        data: { status: 'SUCCEEDED', attempts, deliveredAt: new Date(), lastError: null },
      });
      if (delivery.integrationId) {
        await tx.integration.update({
          where: { id: delivery.integrationId },
          data: { lastSuccessfulEventAt: new Date() },
        });
      }
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
      const dead = attempts >= config.maxDeliveryAttempts;
      await tx.eventDelivery.update({
        where: { id: deliveryId },
        data: {
          status: dead ? 'DEAD_LETTER' : 'FAILED',
          attempts,
          lastError: message,
          nextAttemptAt: new Date(Date.now() + config.retryBaseMs * 2 ** (attempts - 1)),
        },
      });
      if (dead && delivery.integrationId) {
        await tx.integration.update({ where: { id: delivery.integrationId }, data: { errorCount: { increment: 1 } } });
      }
      this.logger.warn(`Delivery ${deliveryId} to ${delivery.consumer} failed (attempt ${attempts}): ${message}`);
    }
  }
}

function eventAllowed(permissions: { eventName: string; allowed: boolean }[], eventName: string) {
  if (permissions.length === 0) return true;
  return permissions.some((p) => p.eventName === eventName && p.allowed);
}
