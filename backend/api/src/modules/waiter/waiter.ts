import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Tenant, TenantContext } from '../../common/context';
import { httpError } from '../../common/http';
import { OrdersService } from '../../core/orders/orders.service';
import { ForModule, TenantScoped } from '../../core/tenancy/tenant.guard';
import { PrismaService } from '../../prisma/prisma.service';

/** Waiter Management (spec 9.6): ready-to-serve orders, service requests, my tables. */
@Controller('waiter')
@ForModule('waiter_management')
export class WaiterController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Get('board')
  @TenantScoped('waiter.view')
  board(@Tenant() ctx: TenantContext) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [tables, ready, active, requests] = await Promise.all([
        tx.diningTable.findMany({ where: { tenantId: ctx.tenantId, isActive: true }, orderBy: { code: 'asc' } }),
        tx.order.findMany({ where: { tenantId: ctx.tenantId, status: 'READY', type: 'DINE_IN' }, include: { items: true }, orderBy: { updatedAt: 'asc' } }),
        tx.order.groupBy({ by: ['tableId'], where: { tenantId: ctx.tenantId, status: { in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED'] } }, _count: true }),
        tx.serviceRequest.findMany({ where: { tenantId: ctx.tenantId, resolvedAt: null }, orderBy: { createdAt: 'asc' } }),
      ]);
      const mine = new Set(tables.filter((t) => t.assignedEmployeeId && t.assignedEmployeeId === ctx.employeeId).map((t) => t.id));
      return {
        tables: tables.map((t) => ({ ...t, mine: mine.has(t.id), openOrders: active.find((a) => a.tableId === t.id)?._count ?? 0 })),
        ready: ready.map((o) => ({ ...o, mine: !!o.tableId && mine.has(o.tableId) })),
        requests: requests.map((r) => ({ ...r, mine: mine.has(r.tableId) })),
      };
    });
  }

  @Post('orders/:orderId/served')
  @HttpCode(HttpStatus.OK)
  @TenantScoped('waiter.manage')
  served(@Tenant() ctx: TenantContext, @Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const order = await this.orders.transition(tx, ctx, orderId, 'SERVED');
      await this.orders.completeIfDone(tx, ctx, order);
      return order;
    });
  }

  @Post('requests/:requestId/resolve')
  @HttpCode(HttpStatus.OK)
  @TenantScoped('waiter.manage')
  resolve(@Tenant() ctx: TenantContext, @Param('requestId', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const { count } = await tx.serviceRequest.updateMany({ where: { id, tenantId: ctx.tenantId, resolvedAt: null }, data: { resolvedAt: new Date() } });
      if (count !== 1) throw httpError(HttpStatus.NOT_FOUND, 'REQUEST_NOT_FOUND', 'Request not found or already handled');
      return { id, resolved: true };
    });
  }
}
