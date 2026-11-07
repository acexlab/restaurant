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
import { randomBytes } from 'crypto';
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

/** Restaurant A gets the full Phase 1 set: menu, tables, waiter + POS, kitchen connections. Safe to re-run. */
async function seedDemoOperations(tenantId: string) {
  for (const moduleId of ['qr_menu', 'online_ordering', 'kitchen_display', 'waiter_management', 'pos_billing']) {
    const def = findModule(moduleId)!;
    await prisma.moduleInstallation.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId } },
      update: { status: 'ACTIVE' },
      create: { tenantId, moduleId, status: 'ACTIVE', version: def.version, activatedAt: new Date() },
    });
    await prisma.featureFlag.createMany({ data: def.features.map((f) => ({ tenantId, moduleId, featureKey: f.key, enabled: f.defaultEnabled })), skipDuplicates: true });
  }
  for (const src of ['online_ordering', 'pos_billing', 'waiter_management']) {
    await prisma.integration.upsert({
      where: { tenantId_sourceModule_destinationModule: { tenantId, sourceModule: src, destinationModule: 'kitchen_display' } },
      update: { status: 'ACTIVE' },
      create: { tenantId, sourceModule: src, destinationModule: 'kitchen_display' },
    });
  }
  if ((await prisma.menuCategory.count({ where: { tenantId } })) > 0) return;

  const menu: { name: string; nameMl: string; items: { name: string; nameMl?: string; price: number; veg: boolean; desc?: string; variants?: [string, number][]; addons?: [string, number][] }[] }[] = [
    { name: 'Starters', nameMl: 'സ്റ്റാർട്ടറുകൾ', items: [
      { name: 'Kozhi Porichathu', nameMl: 'കോഴി പൊരിച്ചത്', price: 220, veg: false, desc: 'Kerala-style fried chicken' },
      { name: 'Banana Fritters', nameMl: 'പഴംപൊരി', price: 60, veg: true },
    ] },
    { name: 'Biryani', nameMl: 'ബിരിയാണി', items: [
      { name: 'Malabar Chicken Biryani', price: 260, veg: false, variants: [['Half', 180], ['Full', 260]], addons: [['Extra raita', 30]] },
      { name: 'Vegetable Biryani', price: 190, veg: true, addons: [['Extra raita', 30]] },
    ] },
    { name: 'Breads & Curries', nameMl: 'കറികൾ', items: [
      { name: 'Malabar Parotta', nameMl: 'പൊറോട്ട', price: 25, veg: true },
      { name: 'Beef Ularthiyathu', nameMl: 'ബീഫ് ഉലർത്തിയത്', price: 240, veg: false },
      { name: 'Kadala Curry', nameMl: 'കടല കറി', price: 120, veg: true },
    ] },
    { name: 'Drinks & Desserts', nameMl: 'പാനീയങ്ങൾ', items: [
      { name: 'Fresh Lime Soda', price: 60, veg: true, addons: [['Extra mint', 10]] },
      { name: 'Sulaimani', nameMl: 'സുലൈമാനി', price: 30, veg: true },
      { name: 'Ada Pradhaman', nameMl: 'അട പ്രഥമൻ', price: 90, veg: true },
    ] },
  ];
  for (const [ci, c] of menu.entries()) {
    const cat = await prisma.menuCategory.create({ data: { tenantId, name: c.name, nameMl: c.nameMl, sortOrder: ci } });
    for (const [ii, i] of c.items.entries()) {
      await prisma.menuItem.create({
        data: {
          tenantId, categoryId: cat.id, name: i.name, nameMl: i.nameMl, description: i.desc, pricePaise: i.price * 100, isVeg: i.veg, sortOrder: ii,
          variants: { create: (i.variants ?? []).map(([name, p]) => ({ tenantId, name, pricePaise: p * 100 })) },
          addons: { create: (i.addons ?? []).map(([name, p]) => ({ tenantId, name, pricePaise: p * 100 })) },
        },
      });
    }
  }
  for (let n = 1; n <= 6; n++) {
    await prisma.diningTable.create({ data: { tenantId, code: `T${n}`, seats: n <= 4 ? 4 : 6, qrToken: randomBytes(12).toString('base64url') } });
  }
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

  await seedDemoOperations(a.id);
  console.log(`Seeded tenants:\n  ${a.name} (${a.id})\n  ${b.name} (${b.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
