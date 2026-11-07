import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { Order } from '@prisma/client';
import { z } from 'zod';
import { Tenant, TenantContext } from '../../common/context';
import { financialYear, nextNumber } from '../../common/counters';
import { httpError, parse } from '../../common/http';
import { AuditService } from '../../core/audit/audit.service';
import { OrdersService } from '../../core/orders/orders.service';
import { totals } from '../../core/orders/pricing';
import { ForModule, TenantScoped } from '../../core/tenancy/tenant.guard';
import { OutboxService } from '../../integration-engine/outbox.service';
import { isFeatureEnabled } from '../../module-registry/module-registry.service';
import { localDate } from '../digital-token/token.service';
import { PrismaService, Tx } from '../../prisma/prisma.service';

const MODULE_ID = 'pos_billing';

const DiscountSchema = z.object({ discountPaise: z.number().int().min(0), reason: z.string().trim().min(2).max(200) });
const PaymentSchema = z.object({
  method: z.enum(['CASH', 'UPI', 'CARD']),
  amountPaise: z.number().int().min(1).max(100_000_000),
  /** UPI transaction id / card slip number. */
  reference: z.string().trim().max(64).optional(),
});
const RefundSchema = z.object({ reason: z.string().trim().min(2).max(200) });
const DateQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

const paidSoFar = (payments: { amountPaise: number; refundedAt: Date | null }[]) =>
  payments.filter((p) => !p.refundedAt).reduce((s, p) => s + p.amountPaise, 0);

/**
 * POS & Billing (spec 9.7, 14). Records payments taken at the counter (cash, UPI, card terminal).
 * shortcut: no payment-gateway integration; online UPI/card capture needs a provider account (Razorpay etc.).
 */
@Controller('pos')
@ForModule(MODULE_ID)
export class PosController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  /** Bills still to settle. */
  @Get('orders')
  @TenantScoped('pos.view')
  open(@Tenant() ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.order.findMany({
        where: { tenantId: ctx.tenantId, paymentStatus: 'UNPAID', status: { not: 'CANCELLED' } },
        include: { items: true, payments: true },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  @Post('orders/:orderId/discount')
  @HttpCode(HttpStatus.OK)
  @TenantScoped('pos.operate')
  discount(@Tenant() ctx: TenantContext, @Param('orderId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(DiscountSchema, body);
    return this.prisma.withTenant(ctx, async (tx) => {
      const order = await this.locked(tx, ctx.tenantId, id);
      if (order.paymentStatus !== 'UNPAID' || paidSoFar(order.payments) > 0) {
        throw httpError(HttpStatus.CONFLICT, 'BILL_LOCKED', 'Discounts can only be applied before any payment');
      }
      if (input.discountPaise > order.subtotalPaise) throw httpError(HttpStatus.BAD_REQUEST, 'DISCOUNT_TOO_LARGE', 'Discount is more than the bill');
      const t = totals(order.items, input.discountPaise);
      const after = await tx.order.update({ where: { id }, data: t, include: { items: true, payments: true } });
      await this.audit.record(tx, ctx, {
        action: 'order.discounted',
        entityType: 'Order',
        entityId: id,
        before: { discountPaise: order.discountPaise, totalPaise: order.totalPaise },
        after: { discountPaise: t.discountPaise, totalPaise: t.totalPaise },
        metadata: { reason: input.reason },
      });
      return after;
    });
  }

  @Post('orders/:orderId/payments')
  @TenantScoped('pos.operate')
  pay(@Tenant() ctx: TenantContext, @Param('orderId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(PaymentSchema, body);
    return this.prisma.withTenant(ctx, async (tx) => {
      const order = await this.locked(tx, ctx.tenantId, id);
      if (order.status === 'CANCELLED' || order.paymentStatus !== 'UNPAID') {
        throw httpError(HttpStatus.CONFLICT, 'NOT_PAYABLE', `Order ${order.label} is ${order.paymentStatus === 'PAID' ? 'already paid' : order.status.toLowerCase()}`);
      }
      if (input.method === 'UPI' && !(await isFeatureEnabled(tx, ctx.tenantId, MODULE_ID, 'upi_payments'))) {
        throw httpError(HttpStatus.BAD_REQUEST, 'FEATURE_DISABLED', 'UPI payments are switched off');
      }
      const remaining = order.totalPaise - paidSoFar(order.payments);
      // Only cash can be over-tendered (change is given back); card/UPI must match what is owed.
      if (input.method !== 'CASH' && input.amountPaise > remaining) throw httpError(HttpStatus.BAD_REQUEST, 'OVERPAYMENT', 'Amount is more than the balance due');
      const applied = Math.min(input.amountPaise, remaining);
      if (applied < remaining && !(await isFeatureEnabled(tx, ctx.tenantId, MODULE_ID, 'split_payments'))) {
        throw httpError(HttpStatus.BAD_REQUEST, 'FEATURE_DISABLED', 'Split payments are switched off: collect the full amount');
      }
      await tx.payment.create({
        data: { tenantId: ctx.tenantId, orderId: id, method: input.method, amountPaise: applied, reference: input.reference, receivedById: ctx.userId },
      });

      let result: Order = order;
      if (applied === remaining) {
        const today = localDate((await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } })).timezone);
        const fy = financialYear(today);
        const invoiceNumber = `INV/${fy.label}/${String(await nextNumber(tx, ctx.tenantId, 'invoice', fy.start)).padStart(6, '0')}`;
        result = await tx.order.update({ where: { id }, data: { paymentStatus: 'PAID', invoiceNumber } });
        await this.outbox.publish(tx, ctx, {
          eventName: 'payment.completed',
          sourceModule: MODULE_ID,
          entityId: id,
          payload: { orderId: id, label: order.label, invoiceNumber, totalPaise: order.totalPaise, methods: [...new Set([...order.payments.map((p) => p.method), input.method])] },
        });
        await this.orders.completeIfDone(tx, ctx, result);
      }
      return { order: result, balancePaise: remaining - applied, changePaise: input.amountPaise - applied };
    });
  }

  @Post('orders/:orderId/refund')
  @HttpCode(HttpStatus.OK)
  @TenantScoped('payments.refund')
  refund(@Tenant() ctx: TenantContext, @Param('orderId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { reason } = parse(RefundSchema, body);
    return this.prisma.withTenant(ctx, async (tx) => {
      if (!(await isFeatureEnabled(tx, ctx.tenantId, MODULE_ID, 'refunds'))) throw httpError(HttpStatus.FORBIDDEN, 'FEATURE_DISABLED', 'Refunds are switched off');
      const order = await this.locked(tx, ctx.tenantId, id);
      if (order.paymentStatus !== 'PAID') throw httpError(HttpStatus.CONFLICT, 'NOT_PAID', 'Only paid orders can be refunded');
      const amount = paidSoFar(order.payments);
      await tx.payment.updateMany({ where: { orderId: id, refundedAt: null }, data: { refundedAt: new Date() } });
      const after = await tx.order.update({ where: { id }, data: { paymentStatus: 'REFUNDED' } });
      await this.audit.record(tx, ctx, { action: 'payment.refunded', entityType: 'Order', entityId: id, after: { amountPaise: amount }, metadata: { reason } });
      await this.outbox.publish(tx, ctx, { eventName: 'payment.refunded', sourceModule: MODULE_ID, entityId: id, payload: { orderId: id, label: order.label, amountPaise: amount } });
      return after;
    });
  }

  /** GST tax invoice data (CGST/SGST split for intra-state Kerala sales). */
  @Get('orders/:orderId/invoice')
  @TenantScoped('pos.view')
  invoice(@Tenant() ctx: TenantContext, @Param('orderId', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const order = await tx.order.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { items: true, payments: true } });
      if (!order) throw httpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found');
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } });
      const branch = await tx.branch.findFirst({ where: { tenantId: ctx.tenantId, ...(order.branchId ? { id: order.branchId } : {}) }, orderBy: { createdAt: 'asc' } });
      const cgst = Math.floor(order.taxPaise / 2);
      return {
        seller: { name: tenant.legalName ?? tenant.name, gstin: branch?.gstin ?? tenant.gstin, address: [branch?.address, branch?.city, branch?.state].filter(Boolean).join(', ') },
        invoiceNumber: order.invoiceNumber,
        date: order.createdAt,
        order: { label: order.label, type: order.type, tableCode: order.tableCode, status: order.status, paymentStatus: order.paymentStatus },
        items: order.items.map((i) => ({ name: i.name, variantName: i.variantName, addons: i.addons, quantity: i.quantity, unitPricePaise: i.unitPricePaise, lineTotalPaise: i.lineTotalPaise, taxRateBps: i.taxRateBps })),
        subtotalPaise: order.subtotalPaise,
        discountPaise: order.discountPaise,
        cgstPaise: cgst,
        sgstPaise: order.taxPaise - cgst,
        totalPaise: order.totalPaise,
        payments: order.payments.map((p) => ({ method: p.method, amountPaise: p.amountPaise, reference: p.reference, refunded: !!p.refundedAt })),
      };
    });
  }

  /** End-of-day register report. */
  @Get('closing-report')
  @TenantScoped('pos.view')
  closing(@Tenant() ctx: TenantContext, @Query() q: unknown) {
    const { date } = parse(DateQuery, q);
    return this.prisma.withTenant(ctx, async (tx) => {
      const day = date ?? localDate((await tx.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId } })).timezone);
      const orders = await tx.order.findMany({ where: { tenantId: ctx.tenantId, serviceDate: new Date(day) }, include: { payments: true } });
      const paid = orders.filter((o) => o.paymentStatus === 'PAID');
      const payments = orders.flatMap((o) => o.payments);
      const byMethod = Object.fromEntries(['CASH', 'UPI', 'CARD'].map((m) => [m, payments.filter((p) => p.method === m && !p.refundedAt).reduce((s, p) => s + p.amountPaise, 0)]));
      return {
        date: day,
        ordersTotal: orders.length,
        ordersPaid: paid.length,
        ordersCancelled: orders.filter((o) => o.status === 'CANCELLED').length,
        grossSalesPaise: paid.reduce((s, o) => s + o.subtotalPaise, 0),
        discountsPaise: paid.reduce((s, o) => s + o.discountPaise, 0),
        taxPaise: paid.reduce((s, o) => s + o.taxPaise, 0),
        netCollectedPaise: Object.values(byMethod).reduce((s, v) => s + v, 0),
        byMethod,
        refundsPaise: payments.filter((p) => p.refundedAt).reduce((s, p) => s + p.amountPaise, 0),
        unpaidOrders: orders.filter((o) => o.paymentStatus === 'UNPAID' && o.status !== 'CANCELLED').length,
      };
    });
  }

  /** Row-locks the order so two cashiers can't settle the same bill twice. */
  private async locked(tx: Tx, tenantId: string, id: string) {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    const order = await tx.order.findFirst({ where: { id, tenantId }, include: { items: true, payments: true } });
    if (!order) throw httpError(HttpStatus.NOT_FOUND, 'ORDER_NOT_FOUND', 'Order not found');
    return order;
  }
}
