import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Tenant, TenantContext } from '../../common/context';
import { httpError, indianMobile, parse } from '../../common/http';
import { localDate } from '../../modules/digital-token/token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantScoped } from '../tenancy/tenant.guard';
import { OrdersService, SOURCE_MODULE } from './orders.service';

export const CartLineSchema = z.object({
  menuItemId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  addonIds: z.array(z.string().uuid()).max(20).optional(),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().trim().max(200).optional(),
});

const CreateSchema = z.object({
  source: z.enum(['WAITER', 'POS']),
  type: z.enum(['DINE_IN', 'TAKEAWAY']).default('DINE_IN'),
  tableId: z.string().uuid().optional(),
  lines: z.array(CartLineSchema).min(1).max(100),
  customerName: z.string().trim().max(80).optional(),
  customerPhone: indianMobile.optional(),
  notes: z.string().trim().max(300).optional(),
  idempotencyKey: z.string().uuid().optional(),
});
const StatusSchema = z.object({ status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED']) });
const CancelSchema = z.object({ reason: z.string().trim().min(2).max(200) });
const ListQuery = z.object({
  view: z.enum(['active', 'today', 'all']).default('active'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const ACTIVE = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'] as const;

/** Spec 10 "Orders". Tenant from X-Xeva-Tenant. */
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Get()
  @TenantScoped('orders.view')
  async list(@Tenant() ctx: TenantContext, @Query() query: unknown) {
    const q = parse(ListQuery, query);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { timezone: true } });
    return this.prisma.withTenant(ctx, (tx) =>
      tx.order.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(q.view === 'active' ? { status: { in: [...ACTIVE] } } : {}),
          ...(q.view === 'today' ? { serviceDate: new Date(localDate(tenant.timezone)) } : {}),
        },
        include: { items: true },
        orderBy: { createdAt: q.view === 'active' ? 'asc' : 'desc' },
        take: q.limit,
      }),
    );
  }

  @Get(':orderId')
  @TenantScoped('orders.view')
  async get(@Tenant() ctx: TenantContext, @Param('orderId', ParseUUIDPipe) orderId: string) {
    const order = await this.prisma.withTenant(ctx, (tx) =>
      tx.order.findFirst({ where: { id: orderId, tenantId: ctx.tenantId }, include: { items: true, payments: true } }),
    );
    if (!order) throw httpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found');
    return order;
  }

  /** Staff-entered orders (waiter handheld or POS counter). Customer QR orders use the public API. */
  @Post()
  @TenantScoped('orders.create')
  async create(@Tenant() ctx: TenantContext, @Body() body: unknown) {
    const input = parse(CreateSchema, body);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { timezone: true } });
    return this.prisma.withTenant(ctx, async (tx) => {
      await this.orders.requireModule(tx, ctx.tenantId, SOURCE_MODULE[input.source]);
      return this.orders.create(tx, ctx, input, localDate(tenant.timezone));
    });
  }

  @Patch(':orderId/status')
  @TenantScoped('orders.modify')
  setStatus(@Tenant() ctx: TenantContext, @Param('orderId', ParseUUIDPipe) orderId: string, @Body() body: unknown) {
    const { status } = parse(StatusSchema, body);
    return this.prisma.withTenant(ctx, async (tx) => {
      const order = await this.orders.transition(tx, ctx, orderId, status);
      if (status === 'SERVED' || status === 'READY') await this.orders.completeIfDone(tx, ctx, order);
      return order;
    });
  }

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @TenantScoped('orders.cancel')
  cancel(@Tenant() ctx: TenantContext, @Param('orderId', ParseUUIDPipe) orderId: string, @Body() body: unknown) {
    const { reason } = parse(CancelSchema, body);
    return this.prisma.withTenant(ctx, (tx) => this.orders.transition(tx, ctx, orderId, 'CANCELLED', reason));
  }
}
