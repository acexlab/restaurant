import { HttpStatus } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { localDate } from '../modules/digital-token/token.service';
import type { PrismaService, Tx } from '../prisma/prisma.service';
import { httpError } from './http';

// One answer for "no such restaurant / product off / item missing": nothing to probe.
export const notFound = () => httpError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');

// shortcut: per-process, in-memory limit. Move to Redis once the API runs on more than one instance.
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max = 5, windowMs = 60_000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw httpError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Too many attempts. Please wait a minute.');
  hits.set(key, [...recent, now]);
}

export async function publicTenant(prisma: PrismaService, slug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant || tenant.status !== 'ACTIVE' || tenant.deletedAt) throw notFound();
  return tenant;
}

/**
 * Runs fn in the restaurant's RLS context for a customer-facing route, only if at least one
 * of `modules` is ACTIVE there. Passes the active set so callers can check finer rules.
 */
export async function withPublicTenant<T>(
  prisma: PrismaService,
  slug: string,
  modules: string[],
  fn: (tx: Tx, tenant: Tenant, ctx: { today: string; active: Set<string> }) => Promise<T>,
) {
  const tenant = await publicTenant(prisma, slug);
  const today = localDate(tenant.timezone);
  return prisma.withTenant({ tenantId: tenant.id }, async (tx) => {
    const installs = await tx.moduleInstallation.findMany({ where: { tenantId: tenant.id, status: 'ACTIVE' }, select: { moduleId: true } });
    const active = new Set(installs.map((i) => i.moduleId));
    if (!modules.some((m) => active.has(m))) throw notFound();
    return fn(tx, tenant, { today, active });
  });
}
