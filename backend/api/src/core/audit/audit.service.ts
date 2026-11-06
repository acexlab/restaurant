import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantContext } from '../../common/context';
import type { Tx } from '../../prisma/prisma.service';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

const json = (v: unknown) => (v === undefined || v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue));

/** Append-only audit trail. Always write inside the same transaction as the change being audited. */
@Injectable()
export class AuditService {
  record(tx: Tx, ctx: TenantContext, entry: AuditEntry) {
    return tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        actorType: ctx.actorType,
        actorUserId: ctx.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: json(entry.before),
        after: json(entry.after),
        metadata: json(entry.metadata),
        correlationId: ctx.correlationId,
      },
    });
  }

  /** For platform-level actions by Xeva staff (tenantId may be null). Requires a system transaction. */
  recordPlatform(
    tx: Tx,
    actor: { userId: string; correlationId: string },
    entry: AuditEntry & { tenantId?: string | null },
  ) {
    return tx.auditLog.create({
      data: {
        tenantId: entry.tenantId ?? null,
        actorType: 'PLATFORM_ADMIN',
        actorUserId: actor.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: json(entry.before),
        after: json(entry.after),
        metadata: json(entry.metadata),
        correlationId: actor.correlationId,
      },
    });
  }
}
