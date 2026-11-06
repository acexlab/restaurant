import { Prisma } from '@prisma/client';
import { DEFAULT_ROLES } from '@xeva/contracts';
import type { Tx } from '../../prisma/prisma.service';

export interface ProvisionTenantInput {
  slug: string;
  name: string;
  legalName?: string;
  gstin?: string;
  branding?: Record<string, unknown>;
  firstBranch: { code: string; name: string; city?: string; address?: string; phone?: string };
  owner: { platformUserId: string; displayName: string };
}

/**
 * Creates a restaurant tenant with its first branch, the default role set and an Owner employee.
 * Used by the Super Admin API and by the seed script. Must run in a system (or owner) transaction.
 */
export async function provisionTenant(tx: Tx, input: ProvisionTenantInput) {
  const tenant = await tx.tenant.create({
    data: {
      slug: input.slug,
      name: input.name,
      legalName: input.legalName,
      gstin: input.gstin,
      status: 'ACTIVE',
      branding: (input.branding ?? {}) as Prisma.InputJsonValue,
    },
  });

  const branch = await tx.branch.create({
    data: { tenantId: tenant.id, ...input.firstBranch },
  });

  const roles: Record<string, string> = {};
  for (const def of DEFAULT_ROLES) {
    const role = await tx.role.create({
      data: {
        tenantId: tenant.id,
        key: def.key,
        name: def.name,
        isSystem: true,
        permissions: { create: def.permissions.map((permissionKey) => ({ tenantId: tenant.id, permissionKey })) },
      },
    });
    roles[def.key] = role.id;
  }

  const owner = await tx.employee.create({
    data: {
      tenantId: tenant.id,
      platformUserId: input.owner.platformUserId,
      displayName: input.owner.displayName,
      roles: { create: [{ tenantId: tenant.id, roleId: roles.owner, branchId: null }] },
    },
  });

  return { tenant, branch, owner, roles };
}
