/**
 * M01 Digital Token Management (spec 9.1). Runs standalone: restaurant A has ONLY digital_token.
 * Needs the dev database running (see phase0.spec.ts).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule, configureApp } from '../src/app.module';

const run = `tok${Date.now().toString(36)}`;
let app: INestApplication;
let owner: PrismaClient;
const tokens: Record<string, string> = {};
const t: Record<string, { id: string; slug: string }> = {};
let queueId: string;

const http = () => request(app.getHttpServer());
const as = (who: string, tenant: string) => ({ Authorization: `Bearer ${tokens[who]}`, 'X-Xeva-Tenant': t[tenant].id });

async function login(key: string, email: string, password: string) {
  tokens[key] = (await http().post('/api/v1/auth/login').send({ email, password }).expect(200)).body.accessToken;
}

async function onboard(key: string, planCode: string) {
  const slug = `${key}-${run}`;
  const res = await http()
    .post('/api/v1/tenants')
    .set({ Authorization: `Bearer ${tokens.admin}` })
    .send({ slug, name: `Restaurant ${key}`, ownerEmail: `${key}.${run}@xeva.test`, ownerName: `${key} owner`, planCode, firstBranch: { code: 'M', name: 'Main' } })
    .expect(201);
  t[key] = { id: res.body.tenant.id, slug };
  await login(key, `${key}.${run}@xeva.test`, res.body.ownerTemporaryPassword);
}

const setFeatures = (features: Record<string, boolean>) =>
  http().patch(`/api/v1/tenants/${t.a.id}/modules/digital_token`).set(as('a', 'a')).send({ features }).expect(200);
const issue = (body: object = {}) => http().post(`/api/v1/queues/${queueId}/tokens`).set(as('a', 'a')).send(body);
const board = async () => (await http().get(`/api/v1/queues/${queueId}/board`).set(as('a', 'a')).expect(200)).body;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  owner = new PrismaClient();
  for (const p of [
    { code: 'digital-token-monthly', moduleIds: ['digital_token'] },
    { code: 'restaurant-ordering-monthly', moduleIds: ['qr_menu', 'online_ordering', 'kitchen_display'] },
  ]) {
    await owner.subscriptionPlan.upsert({ where: { code: p.code }, update: {}, create: { ...p, name: p.code, interval: 'MONTHLY', priceInPaise: 100 } });
  }
  const adminEmail = `admin.${run}@xeva.test`;
  await owner.platformUser.create({ data: { email: adminEmail, fullName: 'Admin', isPlatformAdmin: true, passwordHash: await bcrypt.hash('Admin#2026', 4) } });
  await login('admin', adminEmail, 'Admin#2026');

  await onboard('a', 'digital-token-monthly');
  await onboard('b', 'restaurant-ordering-monthly');
  await http().post(`/api/v1/tenants/${t.a.id}/modules`).set(as('a', 'a')).send({ moduleId: 'digital_token' }).expect(201);
});

afterAll(async () => {
  await owner?.$disconnect();
  await app?.close();
});

describe('Module gating', () => {
  it('is unavailable to a restaurant without Digital Token', async () => {
    const res = await http().get('/api/v1/queues').set(as('b', 'b')).expect(403);
    expect(res.body.error.code).toBe('MODULE_NOT_ACTIVE');
    await http().get(`/api/v1/public/restaurants/${t.b.slug}`).expect(200); // the restaurant itself is public
    await http().get(`/api/v1/public/restaurants/${t.b.slug}/tokens/${randomUUID()}`).expect(404);
  });
});

describe('Walk-in tokens', () => {
  it('creates a queue and issues numbered tokens', async () => {
    queueId = (await http().post('/api/v1/queues').set(as('a', 'a')).send({ name: 'Dine-in', prefix: 'A', averageServiceMinutes: 10 }).expect(201)).body.id;
    const labels = [];
    for (const name of ['Asha', 'Biju', 'Chinnu']) labels.push((await issue({ customerName: name, partySize: 2 }).expect(201)).body.label);
    expect(labels).toEqual(['A-001', 'A-002', 'A-003']);
  });

  it('never hands out the same number twice under concurrent issuing', async () => {
    const res = await Promise.all(Array.from({ length: 6 }, () => issue()));
    const numbers = res.map((r) => r.body.label);
    expect(new Set(numbers).size).toBe(6);
    expect(numbers.sort()).toEqual(['A-004', 'A-005', 'A-006', 'A-007', 'A-008', 'A-009']);
  });

  it('priority tokens need the feature, then jump the queue', async () => {
    expect((await issue({ priority: true }).expect(400)).body.error.code).toBe('FEATURE_DISABLED');
    await setFeatures({ priority_queue: true });
    const vip = (await issue({ customerName: 'Elder', priority: true }).expect(201)).body;
    const b = await board();
    expect(b.waiting[0].id).toBe(vip.id);
    expect(b.waiting[0].estimatedWaitMinutes).toBe(0);
    expect(b.waiting[1].estimatedWaitMinutes).toBe(10);
  });
});

describe('Calling', () => {
  it('two counters calling at once get different tokens, priority first', async () => {
    const [x, y] = await Promise.all([
      http().post(`/api/v1/queues/${queueId}/call-next`).set(as('a', 'a')).expect(200),
      http().post(`/api/v1/queues/${queueId}/call-next`).set(as('a', 'a')).expect(200),
    ]);
    expect(x.body.token.id).not.toBe(y.body.token.id);
    expect([x.body.token.label, y.body.token.label]).toContain('A-010'); // the priority token
    expect((await board()).called).toHaveLength(2);
  });

  it('skips, recalls and completes with valid transitions only', async () => {
    const { called, waiting } = await board();
    const [first] = called;
    await http().patch(`/api/v1/tokens/${waiting[0].id}/status`).set(as('a', 'a')).send({ status: 'COMPLETED' }).expect(409);

    await http().patch(`/api/v1/tokens/${first.id}/status`).set(as('a', 'a')).send({ status: 'SKIPPED' }).expect(200);
    const recalled = (await http().post(`/api/v1/tokens/${first.id}/call`).set(as('a', 'a')).expect(200)).body;
    expect(recalled).toMatchObject({ status: 'CALLED', calledCount: 2 });
    await http().patch(`/api/v1/tokens/${first.id}/status`).set(as('a', 'a')).send({ status: 'COMPLETED' }).expect(200);
    await http().patch(`/api/v1/tokens/${first.id}/status`).set(as('a', 'a')).send({ status: 'CANCELLED' }).expect(409);
  });

  it('publishes token events without customer details', async () => {
    const events = await owner.outboxEvent.findMany({ where: { tenantId: t.a.id, sourceModule: 'digital_token' } });
    const names = events.map((e) => e.eventName);
    expect(names.filter((n) => n === 'token.created')).toHaveLength(10);
    expect(names).toEqual(expect.arrayContaining(['token.called', 'token.completed']));
    expect(JSON.stringify(events.map((e) => e.payload))).not.toMatch(/Asha|Elder/);
  });

  it('reports the day', async () => {
    const r = (await http().get(`/api/v1/queues/${queueId}/report`).set(as('a', 'a')).expect(200)).body;
    expect(r).toMatchObject({ issued: 10, priority: 1, byStatus: { COMPLETED: 1, CALLED: 1, WAITING: 8 } });
    expect(r.averageWaitMinutes).toEqual(expect.any(Number));
  });
});

describe('Customer side (public)', () => {
  const base = () => `/api/v1/public/restaurants/${t.a.slug}`;

  it('queue display shows token numbers only', async () => {
    const d = (await http().get(`${base()}/queues/${queueId}/display`).expect(200)).body;
    expect(d.nowServing).toHaveLength(1);
    expect(d.upNext[0]).toBe('A-002'); // A-010 (priority) and A-001 were called by the two counters
    expect(d.waitingCount).toBe(8);
    expect(JSON.stringify(d)).not.toMatch(/Asha|Biju|customer/i);
  });

  it('remote joining is off until the restaurant enables it', async () => {
    const body = { customerName: 'Deepa', customerPhone: '9847012345', partySize: 3 };
    expect((await http().post(`${base()}/queues/${queueId}/tokens`).send(body).expect(403)).body.error.code).toBe('FEATURE_DISABLED');
    await setFeatures({ remote_queue_joining: true });

    const joined = (await http().post(`${base()}/queues/${queueId}/tokens`).send(body).expect(201)).body;
    expect(joined.label).toBe('A-011');
    // Joining again with the same phone returns the same token.
    expect((await http().post(`${base()}/queues/${queueId}/tokens`).send(body).expect(201)).body.tokenId).toBe(joined.tokenId);
    await http().post(`${base()}/queues/${queueId}/tokens`).send({ ...body, customerPhone: '12345' }).expect(400);

    const track = (await http().get(`${base()}/tokens/${joined.tokenId}`).expect(200)).body;
    expect(track).toMatchObject({ label: 'A-011', status: 'WAITING', ahead: 8, estimatedWaitMinutes: 80 });
    expect(track.customerPhone).toBeUndefined();
    // A token can't be read through another restaurant's address.
    await http().get(`/api/v1/public/restaurants/${t.b.slug}/tokens/${joined.tokenId}`).expect(404);
  });

  it('turning the display off hides it', async () => {
    await setFeatures({ queue_display: false });
    await http().get(`${base()}/queues/${queueId}/display`).expect(404);
    await setFeatures({ queue_display: true });
  });

  it('deactivating the module closes staff and public access, keeping data', async () => {
    await http().patch(`/api/v1/tenants/${t.a.id}/modules/digital_token`).set(as('a', 'a')).send({ status: 'INACTIVE' }).expect(200);
    await http().get('/api/v1/queues').set(as('a', 'a')).expect(403);
    await http().get(`${base()}/queues/${queueId}/display`).expect(404);
    await http().post(`/api/v1/tenants/${t.a.id}/modules`).set(as('a', 'a')).send({ moduleId: 'digital_token' }).expect(201);
    expect((await board()).waiting).toHaveLength(9);
  });
});
