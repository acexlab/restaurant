import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { Tenant, TenantContext } from '../../common/context';
import { httpError, parse } from '../../common/http';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { TenantScoped } from '../tenancy/tenant.guard';

const CreateSchema = z.object({
  code: z.string().trim().min(1).max(12),
  seats: z.number().int().min(1).max(40).default(4),
  branchId: z.string().uuid().optional(),
});
const UpdateSchema = z.object({
  seats: z.number().int().min(1).max(40).optional(),
  isActive: z.boolean().optional(),
  /** Waiter responsible for the table; null to unassign. */
  assignedEmployeeId: z.string().uuid().nullable().optional(),
});

const qrToken = () => randomBytes(12).toString('base64url');

/** Shared table service (spec 3): QR codes, waiter assignment. */
@Controller('tables')
export class TablesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @TenantScoped('tables.view')
  list(@Tenant() ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) => tx.diningTable.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { code: 'asc' } }));
  }

  @Post()
  @TenantScoped('tables.manage')
  create(@Tenant() ctx: TenantContext, @Body() body: unknown) {
    const input = parse(CreateSchema, body);
    return this.prisma.withTenant(ctx, async (tx) => {
      if (await tx.diningTable.findUnique({ where: { tenantId_code: { tenantId: ctx.tenantId, code: input.code } } })) {
        throw httpError(HttpStatus.CONFLICT, 'TABLE_EXISTS', `Table ${input.code} already exists`);
      }
      return tx.diningTable.create({ data: { tenantId: ctx.tenantId, ...input, qrToken: qrToken() } });
    });
  }

  @Patch(':tableId')
  @TenantScoped('tables.manage')
  update(@Tenant() ctx: TenantContext, @Param('tableId', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const input = parse(UpdateSchema, body);
    return this.prisma.withTenant(ctx, async (tx) => {
      await this.table(tx, ctx.tenantId, id);
      if (input.assignedEmployeeId && !(await tx.employee.findFirst({ where: { id: input.assignedEmployeeId, tenantId: ctx.tenantId, status: 'ACTIVE' } }))) {
        throw httpError(HttpStatus.BAD_REQUEST, 'INVALID_EMPLOYEE', 'Employee not found');
      }
      return tx.diningTable.update({ where: { id }, data: input });
    });
  }

  /** New QR token: stickers printed before stop working (e.g. after one was photographed and abused). */
  @Post(':tableId/rotate-qr')
  @HttpCode(HttpStatus.OK)
  @TenantScoped('tables.manage')
  rotate(@Tenant() ctx: TenantContext, @Param('tableId', ParseUUIDPipe) id: string) {
    return this.prisma.withTenant(ctx, async (tx) => {
      await this.table(tx, ctx.tenantId, id);
      return tx.diningTable.update({ where: { id }, data: { qrToken: qrToken() } });
    });
  }

  private async table(tx: Tx, tenantId: string, id: string) {
    const t = await tx.diningTable.findFirst({ where: { id, tenantId } });
    if (!t) throw httpError(HttpStatus.NOT_FOUND, 'TABLE_NOT_FOUND', 'Table not found');
    return t;
  }
}
