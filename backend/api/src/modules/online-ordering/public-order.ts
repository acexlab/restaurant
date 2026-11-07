import { Body, Controller, Get, HttpStatus, Ip, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { httpError, indianMobile, parse } from '../../common/http';
import { notFound, rateLimit, withPublicTenant } from '../../common/public';
import { Public } from '../../core/identity/auth.guards';
import { CartLineSchema } from '../../core/orders/orders.controller';
import { OrdersService } from '../../core/orders/orders.service';
import { isFeatureEnabled } from '../../module-registry/module-registry.service';
import { PrismaService, Tx } from '../../prisma/prisma.service';

const OrderSchema = z.object({
  qrToken: z.string().min(8).max(64),
  lines: z.array(CartLineSchema).min(1).max(50),
  customerName: z.string().trim().max(80).optional(),
  customerPhone: indianMobile.optional(),
  notes: z.string().trim().max(300).optional(),
  /** One per cart: a double tap or network retry returns the same order. */
  idempotencyKey: z.string().uuid(),
});
const RequestSchema = z.object({ type: z.enum(['WAITER', 'BILL', 'WATER']) });

const MENU_MODULES = ['qr_menu', 'online_ordering'];

/**
 * Customer QR menu and ordering (spec 4.1, 8, 9.3, 9.4). No login: the table's QR token
 * identifies restaurant + table; orders are fetched back by their unguessable id.
 */
@Public()
@Controller('public/restaurants/:slug')
export class PublicOrderController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  /** Browsable without login, even with ordering switched off (QR Menu standalone). */
  @Get('menu')
  menu(@Param('slug') slug: string) {
    return withPublicTenant(this.prisma, slug, MENU_MODULES, (tx, tenant) =>
      tx.menuCategory.findMany({
        where: { tenantId: tenant.id, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          nameMl: true,
          items: {
            where: { deletedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: {
              id: true, name: true, nameMl: true, description: true, pricePaise: true, taxRateBps: true, isVeg: true, isAvailable: true, imageUrl: true,
              variants: { select: { id: true, name: true, pricePaise: true } },
              addons: { select: { id: true, name: true, pricePaise: true } },
            },
          },
        },
      }),
    );
  }

  /** What the guest at this table can do. */
  @Get('tables/:qrToken')
  table(@Param('slug') slug: string, @Param('qrToken') qrToken: string) {
    return withPublicTenant(this.prisma, slug, MENU_MODULES, async (tx, tenant, { active }) => {
      const table = await this.tableByToken(tx, tenant.id, qrToken);
      return {
        tableCode: table.code,
        canOrder: active.has('online_ordering') && (await isFeatureEnabled(tx, tenant.id, 'online_ordering', 'dine_in')),
        canCallWaiter: active.has('waiter_management') && (await isFeatureEnabled(tx, tenant.id, 'waiter_management', 'service_requests')),
      };
    });
  }

  @Post('orders')
  place(@Param('slug') slug: string, @Ip() ip: string, @Body() body: unknown) {
    const input = parse(OrderSchema, body);
    rateLimit(`order:${slug}:${ip}`, 10);
    return withPublicTenant(this.prisma, slug, ['online_ordering'], async (tx, tenant, { today }) => {
      if (!(await isFeatureEnabled(tx, tenant.id, 'online_ordering', 'dine_in'))) {
        throw httpError(HttpStatus.FORBIDDEN, 'FEATURE_DISABLED', 'Ordering from the table is switched off. Please order with our staff.');
      }
      const table = await this.tableByToken(tx, tenant.id, input.qrToken);
      const order = await this.orders.create(
        tx,
        { tenantId: tenant.id, correlationId: randomUUID() },
        { type: 'DINE_IN', source: 'QR', tableId: table.id, lines: input.lines, customerName: input.customerName, customerPhone: input.customerPhone, notes: input.notes, idempotencyKey: input.idempotencyKey },
        today,
      );
      return { orderId: order.id, label: order.label };
    });
  }

  /** The guest's own order. Never includes phone numbers or staff details. */
  @Get('orders/:orderId')
  track(@Param('slug') slug: string, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return withPublicTenant(this.prisma, slug, MENU_MODULES, async (tx, tenant) => {
      const o = await tx.order.findFirst({ where: { id: orderId, tenantId: tenant.id }, include: { items: true } });
      if (!o) throw notFound();
      return {
        label: o.label,
        status: o.status,
        paymentStatus: o.paymentStatus,
        tableCode: o.tableCode,
        createdAt: o.createdAt,
        items: o.items.map((i) => ({ name: i.name, variantName: i.variantName, addons: i.addons, quantity: i.quantity, lineTotalPaise: i.lineTotalPaise })),
        subtotalPaise: o.subtotalPaise,
        discountPaise: o.discountPaise,
        taxPaise: o.taxPaise,
        totalPaise: o.totalPaise,
      };
    });
  }

  /** "Call waiter" / "Bring the bill" from the table. */
  @Post('tables/:qrToken/requests')
  request(@Param('slug') slug: string, @Param('qrToken') qrToken: string, @Ip() ip: string, @Body() body: unknown) {
    const { type } = parse(RequestSchema, body);
    rateLimit(`req:${slug}:${ip}`, 10);
    return withPublicTenant(this.prisma, slug, ['waiter_management'], async (tx, tenant) => {
      if (!(await isFeatureEnabled(tx, tenant.id, 'waiter_management', 'service_requests'))) throw notFound();
      const table = await this.tableByToken(tx, tenant.id, qrToken);
      const open = await tx.serviceRequest.findFirst({ where: { tenantId: tenant.id, tableId: table.id, type, resolvedAt: null } });
      const r = open ?? (await tx.serviceRequest.create({ data: { tenantId: tenant.id, tableId: table.id, tableCode: table.code, type } }));
      return { requestId: r.id, type: r.type };
    });
  }

  private async tableByToken(tx: Tx, tenantId: string, qrToken: string) {
    const t = await tx.diningTable.findFirst({ where: { qrToken, tenantId, isActive: true } });
    if (!t) throw notFound();
    return t;
  }
}
