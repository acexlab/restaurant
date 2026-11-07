import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma, type Order, type OrderSource, type OrderStatus, type OrderType } from '@prisma/client';
import { EventName } from '@xeva/contracts';
import { nextNumber } from '../../common/counters';
import { httpError } from '../../common/http';
import { EventDispatcher } from '../../integration-engine/event-dispatcher.service';
import { OutboxService } from '../../integration-engine/outbox.service';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { totals } from './pricing';

export interface CartLine {
  menuItemId: string;
  variantId?: string;
  addonIds?: string[];
  quantity: number;
  notes?: string;
}

export interface CreateOrderInput {
  type: OrderType;
  source: OrderSource;
  tableId?: string | null;
  lines: CartLine[];
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface Scope {
  tenantId: string;
  correlationId: string;
  userId?: string;
}

/** Which product module an order "comes from", for event routing through the Integration Centre. */
export const SOURCE_MODULE: Record<OrderSource, string> = { QR: 'online_ordering', WAITER: 'waiter_management', POS: 'pos_billing' };

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['ACCEPTED', 'PREPARING', 'READY', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'COMPLETED', 'CANCELLED'],
  SERVED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

const EVENT: Partial<Record<OrderStatus, EventName>> = {
  ACCEPTED: 'order.confirmed',
  CANCELLED: 'order.cancelled',
  COMPLETED: 'order.completed',
};

/**
 * Shared order service (spec 8). Ordering, Waiter and POS all create orders here; Kitchen
 * learns about them only through order.* events, and reports back with kitchen.* events.
 */
@Injectable()
export class OrdersService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly dispatcher: EventDispatcher,
  ) {}

  onModuleInit() {
    this.dispatcher.subscribe({
      name: 'order_service',
      kind: 'core',
      events: ['kitchen.ticket.accepted', 'kitchen.order.ready'],
      handle: async (e) => {
        const orderId = e.payload.orderId as string | undefined;
        if (!orderId) return; // manual kitchen ticket, no order behind it
        await this.prisma.withTenant({ tenantId: e.tenantId }, async (tx) => {
          const order = await tx.order.findFirst({ where: { id: orderId, tenantId: e.tenantId } });
          if (!order) return;
          const to: OrderStatus = e.eventName === 'kitchen.order.ready' ? 'READY' : 'PREPARING';
          // Idempotent: replays and late events never move an order backwards.
          if (!NEXT[order.status].includes(to)) return;
          const scope = { tenantId: e.tenantId, correlationId: e.correlationId };
          // A prepaid takeaway closes as soon as it is ready.
          await this.completeIfDone(tx, scope, await this.transition(tx, scope, orderId, to));
        });
      },
    });
  }

  async requireModule(tx: Tx, tenantId: string, moduleId: string) {
    const inst = await tx.moduleInstallation.findUnique({ where: { tenantId_moduleId: { tenantId, moduleId } } });
    if (inst?.status !== 'ACTIVE') throw httpError(HttpStatus.FORBIDDEN, 'MODULE_NOT_ACTIVE', `The ${moduleId} product is not active for this restaurant`);
  }

  /** Server-side pricing from the live menu. Client prices are never trusted. */
  async price(tx: Tx, tenantId: string, lines: CartLine[]) {
    const ids = [...new Set(lines.map((l) => l.menuItemId))];
    const items = await tx.menuItem.findMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      include: { variants: true, addons: true, category: true },
    });
    return lines.map((l) => {
      const item = items.find((i) => i.id === l.menuItemId);
      if (!item || !item.isAvailable || !item.category.isActive) {
        throw httpError(HttpStatus.CONFLICT, 'ITEM_UNAVAILABLE', `${item?.name ?? 'An item'} is not available right now`, { menuItemId: l.menuItemId });
      }
      const variant = l.variantId ? item.variants.find((v) => v.id === l.variantId) : undefined;
      if (l.variantId && !variant) throw httpError(HttpStatus.BAD_REQUEST, 'INVALID_VARIANT', `Unknown option for ${item.name}`);
      if (!variant && item.variants.length) throw httpError(HttpStatus.BAD_REQUEST, 'VARIANT_REQUIRED', `Choose an option for ${item.name}`);
      const addons = [...new Set(l.addonIds ?? [])].map((id) => {
        const a = item.addons.find((x) => x.id === id);
        if (!a) throw httpError(HttpStatus.BAD_REQUEST, 'INVALID_ADDON', `Unknown add-on for ${item.name}`);
        return { name: a.name, pricePaise: a.pricePaise };
      });
      const unitPricePaise = (variant?.pricePaise ?? item.pricePaise) + addons.reduce((s, a) => s + a.pricePaise, 0);
      return {
        menuItemId: item.id,
        name: item.name,
        variantName: variant?.name ?? null,
        addons,
        unitPricePaise,
        quantity: l.quantity,
        taxRateBps: item.taxRateBps,
        lineTotalPaise: unitPricePaise * l.quantity,
        notes: l.notes ?? null,
      };
    });
  }

  async create(tx: Tx, scope: Scope, input: CreateOrderInput, today: string) {
    if (input.idempotencyKey) {
      const existing = await tx.order.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: scope.tenantId, idempotencyKey: input.idempotencyKey } },
        include: { items: true },
      });
      if (existing) return existing;
    }
    const table = input.tableId ? await tx.diningTable.findFirst({ where: { id: input.tableId, tenantId: scope.tenantId, isActive: true } }) : null;
    if (input.tableId && !table) throw httpError(HttpStatus.BAD_REQUEST, 'INVALID_TABLE', 'Table not found');

    const priced = await this.price(tx, scope.tenantId, input.lines);
    const number = await nextNumber(tx, scope.tenantId, 'order', today);
    const order = await tx.order.create({
      data: {
        tenantId: scope.tenantId,
        branchId: table?.branchId ?? null,
        serviceDate: new Date(today),
        number,
        label: `#${number}`,
        type: input.type,
        source: input.source,
        tableId: table?.id ?? null,
        tableCode: table?.code ?? null,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        notes: input.notes,
        ...totals(priced),
        idempotencyKey: input.idempotencyKey,
        placedById: scope.userId,
        history: [{ status: 'PLACED', at: new Date().toISOString(), by: scope.userId ?? 'customer' }],
        items: { create: priced.map((p) => ({ ...p, tenantId: scope.tenantId, addons: p.addons as Prisma.InputJsonValue })) },
      },
      include: { items: true },
    });
    await this.outbox.publish(tx, { ...scope, branchId: order.branchId }, {
      eventName: 'order.created',
      sourceModule: SOURCE_MODULE[input.source],
      entityId: order.id,
      payload: {
        orderId: order.id,
        label: order.label,
        type: order.type,
        tableCode: order.tableCode,
        notes: order.notes,
        items: order.items.map((i) => ({ name: i.name, variantName: i.variantName, addons: (i.addons as { name: string }[]).map((a) => a.name), quantity: i.quantity, notes: i.notes })),
      },
    });
    return order;
  }

  /** The only way an order's status changes: validates, records history, publishes the event. */
  async transition(tx: Tx, scope: Scope, orderId: string, to: OrderStatus, reason?: string) {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId: scope.tenantId } });
    if (!order) throw httpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found');
    if (!NEXT[order.status].includes(to)) {
      throw httpError(HttpStatus.CONFLICT, 'INVALID_ORDER_STATE', `Order ${order.label} is ${order.status.toLowerCase()} and cannot become ${to.toLowerCase()}`);
    }
    // "Never paid merely because served" (spec 8): completion needs payment; paid orders need a refund before cancelling.
    if (to === 'COMPLETED' && order.paymentStatus !== 'PAID') throw httpError(HttpStatus.CONFLICT, 'NOT_PAID', `Order ${order.label} is not paid yet`);
    if (to === 'CANCELLED' && order.paymentStatus === 'PAID') throw httpError(HttpStatus.CONFLICT, 'REFUND_FIRST', 'Refund the payment before cancelling');
    if (to === 'COMPLETED' && order.type === 'DINE_IN' && order.status === 'READY') {
      throw httpError(HttpStatus.CONFLICT, 'NOT_SERVED', `Order ${order.label} has not been served yet`);
    }

    const history = [...(order.history as object[]), { status: to, at: new Date().toISOString(), by: scope.userId ?? 'system', ...(reason ? { reason } : {}) }];
    const { count } = await tx.order.updateMany({ where: { id: orderId, status: order.status }, data: { status: to, history } });
    if (count !== 1) throw httpError(HttpStatus.CONFLICT, 'ORDER_CHANGED', 'The order was just changed by someone else. Refresh and try again.');

    await this.outbox.publish(tx, { ...scope, branchId: order.branchId }, {
      eventName: EVENT[to] ?? 'order.updated',
      sourceModule: SOURCE_MODULE[order.source],
      entityId: orderId,
      payload: { orderId, label: order.label, from: order.status, to, tableCode: order.tableCode, ...(reason ? { reason } : {}) },
    });
    return { ...order, status: to, history };
  }

  /** After payment or serving: close the order if it is both paid and handed over. */
  async completeIfDone(tx: Tx, scope: Scope, order: Pick<Order, 'id' | 'status' | 'type' | 'paymentStatus'>) {
    const handedOver = order.status === 'SERVED' || (order.status === 'READY' && order.type === 'TAKEAWAY');
    if (order.paymentStatus === 'PAID' && handedOver) await this.transition(tx, scope, order.id, 'COMPLETED');
  }
}
