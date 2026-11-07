import { Body, Controller, Get, HttpStatus, Injectable, OnModuleInit, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Prisma, type TicketStatus } from '@prisma/client';
import { z } from 'zod';
import { Tenant, TenantContext } from '../../common/context';
import { httpError, parse } from '../../common/http';
import { ForModule, TenantScoped } from '../../core/tenancy/tenant.guard';
import { EventDispatcher } from '../../integration-engine/event-dispatcher.service';
import { OutboxService } from '../../integration-engine/outbox.service';
import { isFeatureEnabled } from '../../module-registry/module-registry.service';
import { PrismaService } from '../../prisma/prisma.service';

const MODULE_ID = 'kitchen_display';

const NEXT: Record<TicketStatus, TicketStatus[]> = {
  NEW: ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED'],
  SERVED: [],
  CANCELLED: [],
};

/** Kitchen Display (spec 9.5). Owns kitchen_tickets; fed by order.created when connected, or manual tickets. */
@Injectable()
export class KitchenService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly dispatcher: EventDispatcher,
  ) {}

  onModuleInit() {
    this.dispatcher.subscribe({
      name: MODULE_ID,
      kind: 'module',
      events: ['order.created', 'order.cancelled'],
      handle: async (e) => {
        const p = e.payload as { orderId: string; label: string; tableCode?: string | null; type?: string; items?: unknown[] };
        await this.prisma.withTenant({ tenantId: e.tenantId }, async (tx) => {
          if (e.eventName === 'order.created') {
            // The (tenantId, orderId) unique key makes redelivery a no-op.
            await tx.kitchenTicket.createMany({
              data: [{ tenantId: e.tenantId, orderId: p.orderId, label: p.label, tableCode: p.tableCode ?? null, orderType: p.type ?? null, items: (p.items ?? []) as Prisma.InputJsonValue }],
              skipDuplicates: true,
            });
          } else {
            await tx.kitchenTicket.updateMany({ where: { tenantId: e.tenantId, orderId: p.orderId, status: { in: ['NEW', 'PREPARING', 'READY'] } }, data: { status: 'CANCELLED' } });
          }
        });
      },
    });
  }

  tickets(ctx: TenantContext, view: 'active' | 'done') {
    const statuses: TicketStatus[] = view === 'active' ? ['NEW', 'PREPARING', 'READY'] : ['SERVED', 'CANCELLED'];
    return this.prisma.withTenant(ctx, (tx) =>
      tx.kitchenTicket.findMany({
        where: { tenantId: ctx.tenantId, status: { in: statuses } },
        orderBy: { createdAt: view === 'active' ? 'asc' : 'desc' },
        take: 200,
      }),
    );
  }

  manual(ctx: TenantContext, input: { label: string; tableCode?: string; items: { name: string; quantity: number; notes?: string }[] }) {
    return this.prisma.withTenant(ctx, async (tx) => {
      if (!(await isFeatureEnabled(tx, ctx.tenantId, MODULE_ID, 'manual_tickets'))) {
        throw httpError(HttpStatus.FORBIDDEN, 'FEATURE_DISABLED', 'Manual tickets are switched off');
      }
      const t = await tx.kitchenTicket.create({ data: { tenantId: ctx.tenantId, label: input.label, tableCode: input.tableCode, items: input.items } });
      await this.outbox.publish(tx, ctx, { eventName: 'kitchen.ticket.created', sourceModule: MODULE_ID, entityId: t.id, payload: { ticketId: t.id, label: t.label } });
      return t;
    });
  }

  setStatus(ctx: TenantContext, id: string, to: TicketStatus) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const t = await tx.kitchenTicket.findFirst({ where: { id, tenantId: ctx.tenantId } });
      if (!t) throw httpError(HttpStatus.NOT_FOUND, 'TICKET_NOT_FOUND', 'Ticket not found');
      if (!NEXT[t.status].includes(to)) throw httpError(HttpStatus.CONFLICT, 'INVALID_TICKET_STATE', `Ticket ${t.label} is ${t.status.toLowerCase()}`);
      const { count } = await tx.kitchenTicket.updateMany({
        where: { id, status: t.status },
        data: { status: to, ...(to === 'PREPARING' ? { startedAt: new Date() } : {}), ...(to === 'READY' ? { readyAt: new Date() } : {}) },
      });
      if (count !== 1) throw httpError(HttpStatus.CONFLICT, 'TICKET_CHANGED', 'Ticket was just changed. Refresh.');
      const eventName = to === 'PREPARING' ? 'kitchen.ticket.accepted' : to === 'READY' ? 'kitchen.order.ready' : null;
      if (eventName) {
        await this.outbox.publish(tx, ctx, {
          eventName,
          sourceModule: MODULE_ID,
          entityId: t.id,
          payload: { ticketId: t.id, orderId: t.orderId, label: t.label, tableCode: t.tableCode },
        });
      }
      return { ...t, status: to };
    });
  }
}

const ManualSchema = z.object({
  label: z.string().trim().min(1).max(20),
  tableCode: z.string().trim().max(12).optional(),
  items: z.array(z.object({ name: z.string().trim().min(1).max(80), quantity: z.number().int().min(1).max(50), notes: z.string().trim().max(200).optional() })).min(1).max(50),
});
const StatusSchema = z.object({ status: z.enum(['PREPARING', 'READY', 'SERVED', 'CANCELLED']) });
const ViewQuery = z.object({ view: z.enum(['active', 'done']).default('active') });

@Controller('kitchen')
@ForModule(MODULE_ID)
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get('tickets')
  @TenantScoped('kitchen.view')
  list(@Tenant() ctx: TenantContext, @Query() q: unknown) {
    return this.kitchen.tickets(ctx, parse(ViewQuery, q).view);
  }

  @Post('tickets')
  @TenantScoped('kitchen.manage')
  create(@Tenant() ctx: TenantContext, @Body() body: unknown) {
    return this.kitchen.manual(ctx, parse(ManualSchema, body));
  }

  @Patch('tickets/:ticketId')
  @TenantScoped('kitchen.manage')
  update(@Tenant() ctx: TenantContext, @Param('ticketId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.kitchen.setStatus(ctx, id, parse(StatusSchema, body).status);
  }
}
