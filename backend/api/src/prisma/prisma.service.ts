import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { config } from '../config';

export type Tx = Prisma.TransactionClient;

/**
 * All database access goes through one of these helpers so that every query runs
 * inside a transaction with the Row Level Security context set (spec 5.2).
 * Queries made without a context see no tenant data at all.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Runtime connection uses the non-superuser xeva_app role.
    super({ datasourceUrl: config.databaseUrl });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Run fn with RLS scoped to one tenant. tenantId must come from a verified server-side session. */
  withTenant<T>(ctx: { tenantId: string; userId?: string }, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true)`;
      return fn(tx);
    });
  }

  /** Run fn as a platform user with no tenant selected (sees only their own employee memberships). */
  withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      return fn(tx);
    });
  }

  /**
   * Cross-tenant access for trusted internal code only: the outbox dispatcher and audited
   * platform-admin operations. Never call this with input-derived scoping.
   */
  withSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.system', 'on', true)`;
      return fn(tx);
    });
  }
}
