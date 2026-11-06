import { HttpStatus, Injectable } from '@nestjs/common';
import type { Queue, QueueToken, TokenSource, TokenStatus } from '@prisma/client';
import type { TenantContext } from '../../common/context';
import { httpError } from '../../common/http';
import { OutboxService } from '../../integration-engine/outbox.service';
import { isFeatureEnabled } from '../../module-registry/module-registry.service';
import { PrismaService, Tx } from '../../prisma/prisma.service';

export const MODULE_ID = 'digital_token';

export interface IssueInput {
  customerName?: string;
  customerPhone?: string;
  partySize?: number;
  priority: boolean;
}

/** Allowed source states for each staff action. */
const FROM: Record<'CALL' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED', TokenStatus[]> = {
  CALL: ['WAITING', 'SKIPPED', 'CALLED'], // CALLED again = re-announce; SKIPPED = recall
  COMPLETED: ['CALLED'],
  SKIPPED: ['WAITING', 'CALLED'],
  CANCELLED: ['WAITING', 'CALLED', 'SKIPPED'],
};

/** The restaurant's local calendar date (tokens restart at 1 every day). */
export function localDate(timezone: string, at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/**
 * M01 Digital Token Management (spec 9.1). Works standalone: it needs no other module.
 * Other modules learn about tokens only through token.* events.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async today(tenantId: string) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } });
    return localDate(t.timezone);
  }

  async listQueues(ctx: TenantContext) {
    const today = await this.today(ctx.tenantId);
    return this.prisma.withTenant(ctx, async (tx) => {
      const queues = await tx.queue.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'asc' } });
      const counts = await tx.queueToken.groupBy({
        by: ['queueId', 'status'],
        where: { tenantId: ctx.tenantId, serviceDate: new Date(today) },
        _count: true,
      });
      return queues.map((q) => ({
        ...q,
        today: Object.fromEntries(counts.filter((c) => c.queueId === q.id).map((c) => [c.status, c._count])),
      }));
    });
  }

  createQueue(ctx: TenantContext, input: { name: string; prefix: string; averageServiceMinutes: number; branchId?: string }) {
    return this.prisma.withTenant(ctx, async (tx) => {
      if (input.branchId && !(await tx.branch.findFirst({ where: { id: input.branchId, tenantId: ctx.tenantId } }))) {
        throw httpError(HttpStatus.BAD_REQUEST, 'INVALID_BRANCH', 'Branch not found');
      }
      return tx.queue.create({ data: { tenantId: ctx.tenantId, ...input } });
    });
  }

  updateQueue(ctx: TenantContext, queueId: string, input: { isActive?: boolean; averageServiceMinutes?: number; name?: string }) {
    return this.prisma.withTenant(ctx, async (tx) => {
      await this.queue(tx, ctx.tenantId, queueId);
      return tx.queue.update({ where: { id: queueId }, data: input });
    });
  }

  async queue(tx: Tx, tenantId: string, queueId: string) {
    const q = await tx.queue.findFirst({ where: { id: queueId, tenantId } });
    if (!q) throw httpError(HttpStatus.NOT_FOUND, 'QUEUE_NOT_FOUND', 'Queue not found');
    return q;
  }

  /** Shared by staff walk-ins and customer remote joining. Must run inside a tenant transaction. */
  async issue(tx: Tx, scope: { tenantId: string; correlationId: string }, queue: Queue, input: IssueInput, source: TokenSource, today: string) {
    const feature = source === 'WALK_IN' ? 'walk_in_tokens' : 'remote_queue_joining';
    if (!(await isFeatureEnabled(tx, scope.tenantId, MODULE_ID, feature))) {
      throw httpError(HttpStatus.FORBIDDEN, 'FEATURE_DISABLED', `${feature.replace(/_/g, ' ')} is switched off for this restaurant`);
    }
    if (input.priority && !(await isFeatureEnabled(tx, scope.tenantId, MODULE_ID, 'priority_queue'))) {
      throw httpError(HttpStatus.BAD_REQUEST, 'FEATURE_DISABLED', 'Priority tokens are switched off for this restaurant');
    }
    if (!queue.isActive) throw httpError(HttpStatus.CONFLICT, 'QUEUE_CLOSED', 'This queue is closed');

    // Atomic per-queue daily counter: the row lock serialises concurrent issues.
    const [{ lastNumber }] = await tx.$queryRaw<{ lastNumber: number }[]>`
      UPDATE queues
      SET "lastNumber" = CASE WHEN "counterDate" = ${today}::date THEN "lastNumber" + 1 ELSE 1 END,
          "counterDate" = ${today}::date, "updatedAt" = now()
      WHERE id = ${queue.id}::uuid
      RETURNING "lastNumber"`;

    const token = await tx.queueToken.create({
      data: {
        tenantId: scope.tenantId,
        queueId: queue.id,
        serviceDate: new Date(today),
        number: lastNumber,
        label: `${queue.prefix}-${String(lastNumber).padStart(3, '0')}`,
        priority: input.priority,
        source,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        partySize: input.partySize,
      },
    });
    await this.outbox.publish(tx, { ...scope, branchId: queue.branchId }, {
      eventName: 'token.created',
      sourceModule: MODULE_ID,
      entityId: token.id,
      payload: { queueId: queue.id, label: token.label, priority: token.priority, source, partySize: token.partySize ?? null },
    });
    return token;
  }

  async issueWalkIn(ctx: TenantContext, queueId: string, input: IssueInput) {
    const today = await this.today(ctx.tenantId);
    return this.prisma.withTenant(ctx, async (tx) => this.issue(tx, ctx, await this.queue(tx, ctx.tenantId, queueId), input, 'WALK_IN', today));
  }

  /** Tokens waiting ahead of this one (priority first, then arrival order). */
  ahead(tx: Tx, t: QueueToken) {
    return tx.queueToken.count({
      where: {
        queueId: t.queueId,
        serviceDate: t.serviceDate,
        status: 'WAITING',
        OR: [{ priority: true, ...(t.priority ? { issuedAt: { lt: t.issuedAt } } : {}) }, { priority: t.priority, issuedAt: { lt: t.issuedAt } }],
      },
    });
  }

  async estimate(tx: Tx, tenantId: string, queue: Queue, ahead: number) {
    return (await isFeatureEnabled(tx, tenantId, MODULE_ID, 'estimated_waiting_time')) ? ahead * queue.averageServiceMinutes : null;
  }

  /** Everything a counter screen needs for today. */
  async board(ctx: TenantContext, queueId: string) {
    const today = await this.today(ctx.tenantId);
    return this.prisma.withTenant(ctx, async (tx) => {
      const queue = await this.queue(tx, ctx.tenantId, queueId);
      const tokens = await tx.queueToken.findMany({
        where: { queueId, serviceDate: new Date(today) },
        orderBy: [{ priority: 'desc' }, { issuedAt: 'asc' }],
      });
      const waiting = tokens.filter((t) => t.status === 'WAITING');
      const eta = await isFeatureEnabled(tx, ctx.tenantId, MODULE_ID, 'estimated_waiting_time');
      return {
        queue,
        date: today,
        called: tokens.filter((t) => t.status === 'CALLED').sort((a, b) => +b.calledAt! - +a.calledAt!),
        waiting: waiting.map((t, i) => ({ ...t, estimatedWaitMinutes: eta ? i * queue.averageServiceMinutes : null })),
        skipped: tokens.filter((t) => t.status === 'SKIPPED'),
        finished: tokens.filter((t) => t.status === 'COMPLETED' || t.status === 'CANCELLED').length,
        features: {
          priority: await isFeatureEnabled(tx, ctx.tenantId, MODULE_ID, 'priority_queue'),
          display: await isFeatureEnabled(tx, ctx.tenantId, MODULE_ID, 'queue_display'),
          remote: await isFeatureEnabled(tx, ctx.tenantId, MODULE_ID, 'remote_queue_joining'),
        },
      };
    });
  }

  /** Call the next waiting token. Two counters pressing at once get different tokens. */
  async callNext(ctx: TenantContext, queueId: string) {
    const today = await this.today(ctx.tenantId);
    return this.prisma.withTenant(ctx, async (tx) => {
      const queue = await this.queue(tx, ctx.tenantId, queueId);
      const [next] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM queue_tokens
        WHERE "queueId" = ${queueId}::uuid AND "serviceDate" = ${today}::date AND status = 'WAITING'
        ORDER BY priority DESC, "issuedAt" ASC
        LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!next) return { token: null };
      return { token: await this.markCalled(tx, ctx, queue, next.id) };
    });
  }

  async call(ctx: TenantContext, tokenId: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const token = await this.transition(tx, ctx, tokenId, FROM.CALL, null);
      return this.markCalled(tx, ctx, await this.queue(tx, ctx.tenantId, token.queueId), tokenId);
    });
  }

  async setStatus(ctx: TenantContext, tokenId: string, status: 'COMPLETED' | 'SKIPPED' | 'CANCELLED') {
    return this.prisma.withTenant(ctx, async (tx) => {
      const stamp = { COMPLETED: 'completedAt', SKIPPED: 'skippedAt', CANCELLED: 'cancelledAt' }[status];
      const token = await this.transition(tx, ctx, tokenId, FROM[status], { status, [stamp]: new Date() });
      if (status === 'COMPLETED') {
        await this.outbox.publish(tx, ctx, {
          eventName: 'token.completed',
          sourceModule: MODULE_ID,
          entityId: token.id,
          payload: { queueId: token.queueId, label: token.label },
        });
      }
      return token;
    });
  }

  async report(ctx: TenantContext, queueId: string, date?: string) {
    const day = date ?? (await this.today(ctx.tenantId));
    return this.prisma.withTenant(ctx, async (tx) => {
      await this.queue(tx, ctx.tenantId, queueId);
      const tokens = await tx.queueToken.findMany({ where: { queueId, serviceDate: new Date(day) } });
      const waits = tokens.filter((t) => t.calledAt).map((t) => (+t.calledAt! - +t.issuedAt) / 60000);
      const byStatus = Object.fromEntries(['WAITING', 'CALLED', 'COMPLETED', 'SKIPPED', 'CANCELLED'].map((s) => [s, tokens.filter((t) => t.status === s).length]));
      return {
        date: day,
        issued: tokens.length,
        remote: tokens.filter((t) => t.source === 'REMOTE').length,
        priority: tokens.filter((t) => t.priority).length,
        byStatus,
        averageWaitMinutes: waits.length ? Math.round((waits.reduce((a, b) => a + b, 0) / waits.length) * 10) / 10 : null,
        longestWaitMinutes: waits.length ? Math.round(Math.max(...waits)) : null,
      };
    });
  }

  private async markCalled(tx: Tx, ctx: TenantContext, queue: Queue, tokenId: string) {
    const token = await tx.queueToken.update({
      where: { id: tokenId },
      data: { status: 'CALLED', calledAt: new Date(), calledCount: { increment: 1 } },
    });
    await this.outbox.publish(tx, { ...ctx, branchId: queue.branchId }, {
      eventName: 'token.called',
      sourceModule: MODULE_ID,
      entityId: token.id,
      payload: { queueId: queue.id, label: token.label, calledCount: token.calledCount },
    });
    return token;
  }

  /** Conditional update: only succeeds if the token is still in an allowed state (no lost races). */
  private async transition(tx: Tx, ctx: TenantContext, tokenId: string, from: TokenStatus[], data: Record<string, unknown> | null) {
    const token = await tx.queueToken.findFirst({ where: { id: tokenId, tenantId: ctx.tenantId } });
    if (!token) throw httpError(HttpStatus.NOT_FOUND, 'TOKEN_NOT_FOUND', 'Token not found');
    if (data) {
      const { count } = await tx.queueToken.updateMany({ where: { id: tokenId, status: { in: from } }, data });
      if (count === 1) return tx.queueToken.findUniqueOrThrow({ where: { id: tokenId } });
    } else if (from.includes(token.status)) {
      return token;
    }
    throw httpError(HttpStatus.CONFLICT, 'INVALID_TOKEN_STATE', `Token ${token.label} is ${token.status.toLowerCase()}`);
  }
}
