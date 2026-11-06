import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventName } from '@xeva/contracts';
import type { Tx } from '../prisma/prisma.service';

export interface PublishInput {
  eventName: EventName;
  sourceModule: string;
  entityId: string;
  payload: Record<string, unknown>;
  schemaVersion?: number;
}

/**
 * Transactional outbox (spec 7.5). Call publish() with the same transaction that makes the
 * business change: the event is stored if and only if the change commits. The dispatcher
 * delivers it afterwards, at least once.
 */
@Injectable()
export class OutboxService {
  publish(
    tx: Tx,
    scope: { tenantId: string; branchId?: string | null; correlationId: string },
    input: PublishInput,
  ) {
    return tx.outboxEvent.create({
      data: {
        tenantId: scope.tenantId,
        branchId: scope.branchId ?? null,
        eventName: input.eventName,
        schemaVersion: input.schemaVersion ?? 1,
        sourceModule: input.sourceModule,
        entityId: input.entityId,
        correlationId: scope.correlationId,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
  }
}
