import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Tenant, TenantContext } from '../../common/context';
import { parse } from '../../common/http';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantScoped } from '../tenancy/tenant.guard';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().datetime().optional(),
  entityType: z.string().optional(),
});

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @TenantScoped('audit.view')
  async list(@Tenant() ctx: TenantContext, @Query() query: unknown) {
    const q = parse(QuerySchema, query);
    const items = await this.prisma.withTenant(ctx, (tx) =>
      tx.auditLog.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(q.entityType ? { entityType: q.entityType } : {}),
          ...(q.before ? { createdAt: { lt: new Date(q.before) } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: q.limit,
      }),
    );
    return { items, nextCursor: items.length === q.limit ? items[items.length - 1].createdAt.toISOString() : null };
  }
}
