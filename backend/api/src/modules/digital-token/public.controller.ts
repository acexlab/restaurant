import { Body, Controller, Get, HttpStatus, Ip, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { indianMobile, parse } from '../../common/http';
import { notFound, publicTenant, rateLimit, withPublicTenant } from '../../common/public';

import { Public } from '../../core/identity/auth.guards';
import { isFeatureEnabled } from '../../module-registry/module-registry.service';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { MODULE_ID, TokenService } from './token.service';

const JoinSchema = z.object({
  customerName: z.string().trim().min(1).max(80),
  customerPhone: indianMobile,
  partySize: z.number().int().min(1).max(20).optional(),
});


/**
 * Customer-facing token endpoints (no login). Restaurant is resolved from its public slug.
 * Responses never include customer names or phone numbers; a token is looked up by its
 * unguessable UUID, which only its holder has.
 */
@Public()
@Controller('public/restaurants/:slug')
export class PublicTokenController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  @Get()
  async restaurant(@Param('slug') slug: string) {
    const tenant = await this.tenant(slug);
    return { name: tenant.name, slug: tenant.slug, branding: tenant.branding, defaultLocale: tenant.defaultLocale };
  }

  /** Open queues for the restaurant's public home page (names and counts only). */
  @Get('queues')
  async queues(@Param('slug') slug: string) {
    return this.inTenant(slug, async (tx, tenantId, today) => {
      const [queues, waiting, remote, display] = await Promise.all([
        tx.queue.findMany({ where: { tenantId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true } }),
        tx.queueToken.groupBy({ by: ['queueId'], where: { tenantId, serviceDate: new Date(today), status: 'WAITING' }, _count: true }),
        isFeatureEnabled(tx, tenantId, MODULE_ID, 'remote_queue_joining'),
        isFeatureEnabled(tx, tenantId, MODULE_ID, 'queue_display'),
      ]);
      return queues.map((q) => ({
        ...q,
        waitingCount: waiting.find((w) => w.queueId === q.id)?._count ?? 0,
        canJoin: remote,
        hasDisplay: display,
      }));
    });
  }

  /** TV / queue display: now serving and next up. */
  @Get('queues/:queueId/display')
  async display(@Param('slug') slug: string, @Param('queueId', ParseUUIDPipe) queueId: string) {
    return this.inTenant(slug, async (tx, tenantId, today) => {
      if (!(await isFeatureEnabled(tx, tenantId, MODULE_ID, 'queue_display'))) throw notFound();
      const queue = await this.activeQueue(tx, tenantId, queueId);
      const tokens = await tx.queueToken.findMany({
        where: { queueId, serviceDate: new Date(today), status: { in: ['CALLED', 'WAITING'] } },
        orderBy: [{ priority: 'desc' }, { issuedAt: 'asc' }],
        select: { label: true, status: true, calledAt: true },
      });
      const waiting = tokens.filter((t) => t.status === 'WAITING');
      return {
        queue: { name: queue.name },
        nowServing: tokens.filter((t) => t.status === 'CALLED').sort((a, b) => +b.calledAt! - +a.calledAt!).map((t) => t.label),
        upNext: waiting.slice(0, 8).map((t) => t.label),
        waitingCount: waiting.length,
        estimatedWaitMinutes: await this.tokens.estimate(tx, tenantId, queue, waiting.length),
        remoteJoining: await isFeatureEnabled(tx, tenantId, MODULE_ID, 'remote_queue_joining'),
      };
    });
  }

  /** Remote queue joining from the customer's phone (feature: remote_queue_joining). */
  @Post('queues/:queueId/tokens')
  async join(@Param('slug') slug: string, @Param('queueId', ParseUUIDPipe) queueId: string, @Ip() ip: string, @Body() body: unknown) {
    const input = parse(JoinSchema, body);
    rateLimit(`${slug}:${ip}`);
    return this.inTenant(slug, async (tx, tenantId, today) => {
      const queue = await this.activeQueue(tx, tenantId, queueId);
      // Same phone already waiting today: hand back that token instead of a duplicate.
      const existing = await tx.queueToken.findFirst({
        where: { queueId, serviceDate: new Date(today), customerPhone: input.customerPhone, status: { in: ['WAITING', 'CALLED'] } },
      });
      const token =
        existing ?? (await this.tokens.issue(tx, { tenantId, correlationId: randomUUID() }, queue, { ...input, priority: false }, 'REMOTE', today));
      return { tokenId: token.id, label: token.label };
    });
  }

  /** Customer's own token: status, position and estimated wait. */
  @Get('tokens/:tokenId')
  async track(@Param('slug') slug: string, @Param('tokenId', ParseUUIDPipe) tokenId: string) {
    return this.inTenant(slug, async (tx, tenantId) => {
      const token = await tx.queueToken.findFirst({ where: { id: tokenId, tenantId }, include: { queue: true } });
      if (!token) throw notFound();
      const ahead = token.status === 'WAITING' ? await this.tokens.ahead(tx, token) : 0;
      const nowServing = await tx.queueToken.findFirst({
        where: { queueId: token.queueId, serviceDate: token.serviceDate, status: 'CALLED' },
        orderBy: { calledAt: 'desc' },
        select: { label: true },
      });
      return {
        label: token.label,
        status: token.status,
        queueName: token.queue.name,
        ahead,
        estimatedWaitMinutes: token.status === 'WAITING' ? await this.tokens.estimate(tx, tenantId, token.queue, ahead) : null,
        nowServing: nowServing?.label ?? null,
        issuedAt: token.issuedAt,
      };
    });
  }

  private tenant(slug: string) {
    return publicTenant(this.prisma, slug);
  }

  /** Runs fn in the restaurant's RLS context, only if Digital Token is active there. */
  private inTenant<T>(slug: string, fn: (tx: Tx, tenantId: string, today: string) => Promise<T>) {
    return withPublicTenant(this.prisma, slug, [MODULE_ID], (tx, tenant, { today }) => fn(tx, tenant.id, today));
  }

  private async activeQueue(tx: Tx, tenantId: string, queueId: string) {
    const queue = await tx.queue.findFirst({ where: { id: queueId, tenantId, isActive: true } });
    if (!queue) throw notFound();
    return queue;
  }
}
