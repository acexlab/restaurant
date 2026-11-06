/**
 * Development seed. Runs as the schema owner (bypasses RLS) and is safe to re-run.
 *
 * Test accounts (local development only):
 *   Xeva admin          admin@xeva.test            / XevaAdmin#2026
 *   Owner, restaurant A owner@malabarspice.test    / Owner#Malabar2026
 *   Cashier, A          cashier@malabarspice.test  / Cashier#Malabar2026
 *   Owner, restaurant B owner@cochinchai.test      / Owner#Cochin2026
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { ALL_PERMISSIONS, findModule, MODULE_CATALOG } from '@xeva/contracts';
import { provisionTenant } from '../src/core/tenants/provision';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const prisma = new PrismaClient();

async function user(email: string, fullName: string, password: string, isPlatformAdmin = false) {
  return prisma.platformUser.upsert({
    where: { email },
    update: {},
    create: { email, fullName, isPlatformAdmin, passwordHash: await bcrypt.hash(password, 10) },
  });
}

async function seedCatalog() {
  for (const key of ALL_PERMISSIONS) {
    const moduleId = MODULE_CATALOG.find((m) => m.defaultPermissions.includes(key))?.moduleId ?? null;
    await prisma.permission.upsert({ where: { key }, update: { moduleId }, create: { key, moduleId } });
  }
  for (const m of MODULE_CATALOG) {
    const data = {
      name: m.name,
      description: m.description,
      version: m.version,
      category: m.category,
      availability: m.availability,
      definition: m as unknown as Prisma.InputJsonValue,
    };
    await prisma.productModule.upsert({ where: { id: m.moduleId }, update: data, create: { id: m.moduleId, ...data } });
  }

  const plans = [
    {
      code: 'restaurant-ordering-monthly',
      name: 'Restaurant Ordering (Monthly)',
      interval: 'MONTHLY' as const,
      priceInPaise: 2_999_00,
      perBranchPriceInPaise: 999_00,
      moduleIds: ['qr_menu', 'online_ordering', 'kitchen_display', 'waiter_management', 'pos_billing'],
    },
    {
      code: 'digital-token-monthly',
      name: 'Digital Token (Monthly)',
      interval: 'MONTHLY' as const,
      priceInPaise: 999_00,
      perBranchPriceInPaise: 0,
      moduleIds: ['digital_token'],
    },
  ];
  for (const p of plans) {
    await prisma.subscriptionPlan.upsert({ where: { code: p.code }, update: p, create: p });
  }
}

async function seedRestaurant(opts: {
  slug: string;
  name: string;
  city: string;
  branchCode: string;
  ownerId: string;
  ownerName: string;
  planCode: string;
  modules: string[];
  branding: Record<string, unknown>;
}) {
  const existing = await prisma.tenant.findUnique({ where: { slug: opts.slug } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const { tenant, roles } = await provisionTenant(tx, {
      slug: opts.slug,
      name: opts.name,
      branding: opts.branding,
      firstBranch: { code: opts.branchCode, name: `${opts.name} — ${opts.city}`, city: opts.city },
      owner: { platformUserId: opts.ownerId, displayName: opts.ownerName },
    });

    const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { code: opts.planCode } });
    const now = new Date();
    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 86400_000),
      },
    });

    for (const moduleId of opts.modules) {
      const def = findModule(moduleId)!;
      await tx.moduleInstallation.create({
        data: { tenantId: tenant.id, moduleId, status: 'ACTIVE', version: def.version, activatedAt: now },
      });
      await tx.moduleConfiguration.create({
        data: { tenantId: tenant.id, moduleId, config: def.defaultConfiguration as Prisma.InputJsonValue },
      });
      await tx.featureFlag.createMany({
        data: def.features.map((f) => ({ tenantId: tenant.id, moduleId, featureKey: f.key, enabled: f.defaultEnabled })),
      });
    }
    return Object.assign(tenant, { roles });
  });
}

async function main() {
  await seedCatalog();

  await user('admin@xeva.test', 'Xeva Platform Admin', 'XevaAdmin#2026', true);
  const ownerA = await user('owner@malabarspice.test', 'Anwar Malabar', 'Owner#Malabar2026');
  const cashierA = await user('cashier@malabarspice.test', 'Fathima Cashier', 'Cashier#Malabar2026');
  const ownerB = await user('owner@cochinchai.test', 'Joseph Cochin', 'Owner#Cochin2026');

  const a = await seedRestaurant({
    slug: 'malabar-spice-house',
    name: 'Malabar Spice House',
    city: 'Kozhikode',
    branchCode: 'KZD-01',
    ownerId: ownerA.id,
    ownerName: ownerA.fullName,
    planCode: 'restaurant-ordering-monthly',
    modules: ['qr_menu', 'online_ordering', 'kitchen_display'],
    branding: { primaryColor: '#B4532A', tagline: 'Biryani since 1987' },
  });

  const b = await seedRestaurant({
    slug: 'cochin-chai-corner',
    name: 'Cochin Chai Corner',
    city: 'Kochi',
    branchCode: 'KOC-01',
    ownerId: ownerB.id,
    ownerName: ownerB.fullName,
    planCode: 'digital-token-monthly',
    modules: ['digital_token'],
    branding: { primaryColor: '#2F6B4F', tagline: 'Chai, snacks and a quick queue' },
  });

  // Cashier for restaurant A (no module-management permissions).
  const cashierRole = await prisma.role.findUniqueOrThrow({ where: { tenantId_key: { tenantId: a.id, key: 'cashier' } } });
  await prisma.employee.upsert({
    where: { tenantId_platformUserId: { tenantId: a.id, platformUserId: cashierA.id } },
    update: {},
    create: {
      tenantId: a.id,
      platformUserId: cashierA.id,
      displayName: cashierA.fullName,
      roles: { create: [{ tenantId: a.id, roleId: cashierRole.id, branchId: null }] },
    },
  });

  console.log(`Seeded tenants:\n  ${a.name} (${a.id})\n  ${b.name} (${b.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
