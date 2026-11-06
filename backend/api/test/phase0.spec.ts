/**
 * Phase 0 exit criteria (spec 18): create two test restaurants, activate separate modules for
 * each, and verify that data and access are isolated. Also covers permissions, support access,
 * the transactional outbox, at-least-once delivery, duplicate protection, retries, dead letters
 * and replay (spec 7.5, 21).
 *
 * Needs the dev database running: `pnpm db:up && pnpm db:migrate`.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { EventEnvelope } from '@xeva/contracts';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule, configureApp } from '../src/app.module';
import { EventDispatcher } from '../src/integration-engine/event-dispatcher.service';
import { OutboxService } from '../src/integration-engine/outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';

const run = Date.now().toString(36);
const PASSWORD = 'Test#Password2026';

let app: INestApplication;
let owner: PrismaClient; // schema owner: test setup only
let prisma: PrismaService; // app role: subject to RLS
let dispatcher: EventDispatcher;

const tokens: Record<string, string> = {};
let tenantA: string;
let tenantB: string;

const http = () => request(app.getHttpServer());
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

async function createUser(key: string, isPlatformAdmin = false) {
  const email = `${key}.${run}@xeva.test`.toLowerCase(); // login normalises emails to lowercase
  await owner.platformUser.create({
    data: { email, fullName: key, isPlatformAdmin, passwordHash: await bcrypt.hash(PASSWORD, 4) },
  });
  const res = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
  tokens[key] = res.body.accessToken;
  return email;
}

async function createTenant(slug: string, ownerEmail: string, planCode: string) {
  const res = await http()
    .post('/api/v1/tenants')
    .set(as('admin'))
    .send({ slug: `${slug}-${run}`, name: slug, ownerEmail, firstBranch: { code: 'MAIN', name: 'Main', city: 'Kochi' } })
    .expect(201);
  const plan = await owner.subscriptionPlan.findUniqueOrThrow({ where: { code: planCode } });
  await owner.subscription.create({
    data: {
      tenantId: res.body.tenant.id,
      planId: plan.id,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
    },
  });
  return res.body.tenant.id as string;
}

function publishOrderCreated(tenantId: string, orderId: string) {
  return prisma.withTenant({ tenantId }, (tx) =>
    app.get(OutboxService).publish(tx, { tenantId, correlationId: `test-${orderId}` }, {
      eventName: 'order.created',
      sourceModule: 'online_ordering',
      entityId: orderId,
      payload: { orderId },
    }),
  );
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  prisma = app.get(PrismaService);
  dispatcher = app.get(EventDispatcher);
  owner = new PrismaClient();

  for (const plan of [
    { code: 'restaurant-ordering-monthly', moduleIds: ['qr_menu', 'online_ordering', 'kitchen_display', 'waiter_management', 'pos_billing'] },
    { code: 'digital-token-monthly', moduleIds: ['digital_token'] },
  ]) {
    await owner.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: {},
      create: { ...plan, name: plan.code, interval: 'MONTHLY', priceInPaise: 100 },
    });
  }

  await createUser('admin', true);
  const ownerAEmail = await createUser('ownerA');
  const ownerBEmail = await createUser('ownerB');
  const cashierEmail = await createUser('cashierA');

  tenantA = await createTenant('restaurant-a', ownerAEmail, 'restaurant-ordering-monthly');
  tenantB = await createTenant('restaurant-b', ownerBEmail, 'digital-token-monthly');

  // Add the cashier to restaurant A with the Cashier role.
  const cashierUser = await owner.platformUser.findUniqueOrThrow({ where: { email: cashierEmail } });
  const cashierRole = await owner.role.findUniqueOrThrow({ where: { tenantId_key: { tenantId: tenantA, key: 'cashier' } } });
  await owner.employee.create({
    data: {
      tenantId: tenantA,
      platformUserId: cashierUser.id,
      displayName: 'Cashier A',
      roles: { create: [{ tenantId: tenantA, roleId: cashierRole.id }] },
    },
  });
});

afterAll(async () => {
  await owner?.$disconnect();
  await app?.close();
});

describe('Phase 0 exit: two restaurants, separate modules, isolated data', () => {
  it('activates different modules for each restaurant', async () => {
    for (const moduleId of ['qr_menu', 'online_ordering', 'kitchen_display']) {
      await http().post(`/api/v1/tenants/${tenantA}/modules`).set(as('ownerA')).send({ moduleId }).expect(201);
    }
    await http().post(`/api/v1/tenants/${tenantB}/modules`).set(as('ownerB')).send({ moduleId: 'digital_token' }).expect(201);

    const a = await http().get(`/api/v1/tenants/${tenantA}/modules`).set(as('ownerA')).expect(200);
    const b = await http().get(`/api/v1/tenants/${tenantB}/modules`).set(as('ownerB')).expect(200);
    expect(a.body.map((m: { moduleId: string }) => m.moduleId).sort()).toEqual(['kitchen_display', 'online_ordering', 'qr_menu']);
    expect(b.body.map((m: { moduleId: string }) => m.moduleId)).toEqual(['digital_token']);
  });

  it('a module works standalone: Token runs with none of the ordering modules', async () => {
    const b = await http().get(`/api/v1/tenants/${tenantB}/modules`).set(as('ownerB')).expect(200);
    expect(b.body[0]).toMatchObject({ status: 'ACTIVE', features: { walk_in_tokens: true, remote_queue_joining: false } });
  });

  it('blocks activating a module the restaurant has not purchased', async () => {
    const res = await http().post(`/api/v1/tenants/${tenantB}/modules`).set(as('ownerB')).send({ moduleId: 'qr_menu' }).expect(402);
    expect(res.body.error.code).toBe('MODULE_NOT_IN_PLAN');
  });

  it("denies one owner access to the other restaurant's data (route)", async () => {
    const res = await http().get(`/api/v1/tenants/${tenantB}/modules`).set(as('ownerA')).expect(403);
    expect(res.body.error.code).toBe('TENANT_ACCESS_DENIED');
    await http().post(`/api/v1/tenants/${tenantB}/modules`).set(as('ownerA')).send({ moduleId: 'digital_token' }).expect(403);
  });

  it('denies a spoofed X-Xeva-Tenant header', async () => {
    await http().get('/api/v1/integrations').set(as('ownerA')).set('X-Xeva-Tenant', tenantB).expect(403);
    await http().get('/api/v1/audit-logs').set(as('ownerA')).set('X-Xeva-Tenant', tenantB).expect(403);
  });

  it('rejects a branch that belongs to another restaurant', async () => {
    const branchesB = await http().get(`/api/v1/tenants/${tenantB}/branches`).set(as('ownerB')).expect(200);
    await http()
      .get(`/api/v1/tenants/${tenantA}/modules`)
      .set(as('ownerA'))
      .set('X-Xeva-Branch', branchesB.body[0].id)
      .expect(403);
  });

  it('enforces isolation in the database itself (Row Level Security)', async () => {
    // No tenant context: tenant tables are invisible.
    expect(await prisma.moduleInstallation.count()).toBe(0);
    expect(await prisma.branch.count()).toBe(0);

    // Tenant A context: even an unfiltered query returns only A's rows.
    const rows = await prisma.withTenant({ tenantId: tenantA }, (tx) => tx.moduleInstallation.findMany());
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.tenantId === tenantA)).toBe(true);
    const leaked = await prisma.withTenant({ tenantId: tenantA }, (tx) => tx.moduleInstallation.count({ where: { tenantId: tenantB } }));
    expect(leaked).toBe(0);

    // Writing a row for tenant B from tenant A's context is rejected by the policy.
    await expect(
      prisma.withTenant({ tenantId: tenantA }, (tx) =>
        tx.featureFlag.create({ data: { tenantId: tenantB, moduleId: 'digital_token', featureKey: 'x', enabled: true } }),
      ),
    ).rejects.toThrow();
  });
});

describe('Permissions and navigation', () => {
  it('stops a cashier from managing modules', async () => {
    const res = await http().post(`/api/v1/tenants/${tenantA}/modules`).set(as('cashierA')).send({ moduleId: 'pos_billing' }).expect(403);
    expect(res.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('builds navigation from active modules and permissions', async () => {
    const navA = await http().get('/api/v1/me/navigation').set(as('ownerA')).set('X-Xeva-Tenant', tenantA).expect(200);
    const keysA = navA.body.map((n: { key: string }) => n.key);
    expect(keysA).toEqual(expect.arrayContaining(['orders', 'menu', 'kitchen', 'modules']));
    expect(keysA).not.toContain('tokens');

    const navB = await http().get('/api/v1/me/navigation').set(as('ownerB')).set('X-Xeva-Tenant', tenantB).expect(200);
    const keysB = navB.body.map((n: { key: string }) => n.key);
    expect(keysB).toContain('tokens');
    expect(keysB).not.toContain('orders');

    const navCashier = await http().get('/api/v1/me/navigation').set(as('cashierA')).set('X-Xeva-Tenant', tenantA).expect(200);
    const keysC = navCashier.body.map((n: { key: string }) => n.key);
    expect(keysC).toContain('orders');
    expect(keysC).not.toContain('modules');
    expect(keysC).not.toContain('billing');
  });

  it('feature flags change independently of activation and are audited', async () => {
    await http()
      .patch(`/api/v1/tenants/${tenantB}/modules/digital_token`)
      .set(as('ownerB'))
      .send({ features: { priority_queue: true, sms_notifications: false } })
      .expect(200);
    const b = await http().get(`/api/v1/tenants/${tenantB}/modules`).set(as('ownerB')).expect(200);
    expect(b.body[0].features.priority_queue).toBe(true);

    const audit = await http().get('/api/v1/audit-logs').set(as('ownerB')).set('X-Xeva-Tenant', tenantB).expect(200);
    expect(audit.body.items.map((i: { action: string }) => i.action)).toContain('module.features_changed');
    expect(audit.body.items.every((i: { tenantId: string }) => i.tenantId === tenantB)).toBe(true);
  });

  it('deactivation keeps configuration, and reactivation restores it', async () => {
    await http().patch(`/api/v1/tenants/${tenantB}/modules/digital_token`).set(as('ownerB')).send({ status: 'INACTIVE' }).expect(200);
    await http().post(`/api/v1/tenants/${tenantB}/modules`).set(as('ownerB')).send({ moduleId: 'digital_token' }).expect(201);
    const b = await http().get(`/api/v1/tenants/${tenantB}/modules`).set(as('ownerB')).expect(200);
    expect(b.body[0]).toMatchObject({ status: 'ACTIVE', features: { priority_queue: true } });
  });
});

describe('Xeva support access', () => {
  it('requires a time-limited, audited grant before an admin can see restaurant data', async () => {
    await http().get(`/api/v1/tenants/${tenantA}/modules`).set(as('admin')).expect(403);
    await http()
      .post(`/api/v1/tenants/${tenantA}/support-access`)
      .set(as('admin'))
      .send({ reason: 'Investigating kitchen ticket delays', hours: 1 })
      .expect(201);
    await http().get(`/api/v1/tenants/${tenantA}/modules`).set(as('admin')).expect(200);

    const audit = await http().get('/api/v1/audit-logs').set(as('ownerA')).set('X-Xeva-Tenant', tenantA).expect(200);
    expect(audit.body.items.map((i: { action: string }) => i.action)).toContain('support_access.granted');
  });

  it('only Xeva admins can create restaurants', async () => {
    await http()
      .post('/api/v1/tenants')
      .set(as('ownerA'))
      .send({ slug: `nope-${run}`, name: 'Nope', ownerEmail: 'x@y.test', firstBranch: { code: 'M', name: 'M' } })
      .expect(403);
  });
});

describe('Integration engine', () => {
  const received: EventEnvelope[] = [];
  let failuresLeft = 0;
  let integrationId: string;

  beforeAll(() => {
    // Stand-in for the Phase 1 Kitchen Display module.
    dispatcher.subscribe({
      name: 'kitchen_display',
      kind: 'module',
      events: ['order.created'],
      async handle(event) {
        if (failuresLeft > 0) {
          failuresLeft--;
          throw new Error('kitchen printer offline');
        }
        received.push(event);
      },
    });
  });

  afterAll(() => dispatcher.unsubscribe('kitchen_display'));

  it('refuses to connect a module that is not active', async () => {
    const res = await http()
      .post('/api/v1/integrations')
      .set(as('ownerA'))
      .set('X-Xeva-Tenant', tenantA)
      .send({ sourceModule: 'online_ordering', destinationModule: 'pos_billing' })
      .expect(409);
    expect(res.body.error.code).toBe('MODULE_NOT_ACTIVE');
  });

  it('does not deliver events until the modules are connected', async () => {
    await publishOrderCreated(tenantA, 'order-before-connect');
    await dispatcher.drain();
    expect(received).toHaveLength(0);
  });

  it('connects Ordering → Kitchen and delivers the event exactly once per consumer', async () => {
    const res = await http()
      .post('/api/v1/integrations')
      .set(as('ownerA'))
      .set('X-Xeva-Tenant', tenantA)
      .send({ sourceModule: 'online_ordering', destinationModule: 'kitchen_display' })
      .expect(201);
    integrationId = res.body.id;

    const test = await http().post(`/api/v1/integrations/${integrationId}/test`).set(as('ownerA')).set('X-Xeva-Tenant', tenantA).expect(200);
    // Kitchen consumes both events that Ordering publishes to it.
    expect(test.body).toMatchObject({ ok: true, flowingEvents: ['order.created', 'order.cancelled'] });

    const event = await publishOrderCreated(tenantA, 'order-1');
    await dispatcher.drain();
    expect(received.map((e) => e.entityId)).toEqual(['order-1']);
    expect(received[0]).toMatchObject({ tenantId: tenantA, eventName: 'order.created', sourceModule: 'online_ordering' });

    // Simulate the dispatcher crashing after fan-out and re-processing the same event.
    await owner.outboxEvent.update({ where: { id: event.id }, data: { status: 'PENDING' } });
    await dispatcher.drain();
    expect(received.map((e) => e.entityId)).toEqual(['order-1']);
    expect(await owner.eventDelivery.count({ where: { eventId: event.id } })).toBe(1);
  });

  it("never delivers another restaurant's events", async () => {
    await publishOrderCreated(tenantB, 'order-in-b');
    await dispatcher.drain();
    expect(received.find((e) => e.entityId === 'order-in-b')).toBeUndefined();
  });

  it('retries failures, dead-letters them, and replays safely', async () => {
    failuresLeft = 10;
    await publishOrderCreated(tenantA, 'order-2');
    await dispatcher.drain();

    const dead = await http()
      .get('/api/v1/integration-events?status=DEAD_LETTER')
      .set(as('ownerA'))
      .set('X-Xeva-Tenant', tenantA)
      .expect(200);
    expect(dead.body).toHaveLength(1);
    expect(dead.body[0]).toMatchObject({ attempts: 3, lastError: 'kitchen printer offline' });

    const health = await http().post(`/api/v1/integrations/${integrationId}/test`).set(as('ownerA')).set('X-Xeva-Tenant', tenantA).expect(200);
    expect(health.body).toMatchObject({ errorCount: 1, deadLetters: 1 });

    // Tenant B cannot see or replay A's dead letters.
    const deadB = await http().get('/api/v1/integration-events?status=DEAD_LETTER').set(as('ownerB')).set('X-Xeva-Tenant', tenantB).expect(200);
    expect(deadB.body).toHaveLength(0);
    await http().post(`/api/v1/integration-events/${dead.body[0].id}/replay`).set(as('ownerB')).set('X-Xeva-Tenant', tenantB).expect(404);

    failuresLeft = 0;
    await http().post(`/api/v1/integration-events/${dead.body[0].id}/replay`).set(as('ownerA')).set('X-Xeva-Tenant', tenantA).expect(200);
    await dispatcher.drain();
    expect(received.map((e) => e.entityId)).toEqual(['order-1', 'order-2']);
  });

  it('stops delivery when the integration is disabled', async () => {
    await http().post(`/api/v1/integrations/${integrationId}/disable`).set(as('ownerA')).set('X-Xeva-Tenant', tenantA).expect(200);
    await publishOrderCreated(tenantA, 'order-3');
    await dispatcher.drain();
    expect(received.map((e) => e.entityId)).not.toContain('order-3');
  });
});

describe('Audit trail', () => {
  it('is append-only, even for the database owner', async () => {
    const entry = await owner.auditLog.findFirstOrThrow({ where: { tenantId: tenantA } });
    await expect(owner.auditLog.update({ where: { id: entry.id }, data: { action: 'tampered' } })).rejects.toThrow(/append-only/);
    await expect(owner.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/);
  });
});
