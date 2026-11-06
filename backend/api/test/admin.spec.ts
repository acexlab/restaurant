/**
 * Deliverable 2 backend: restaurant onboarding, team management and Xeva Super Admin endpoints.
 * Needs the dev database running (see phase0.spec.ts).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule, configureApp } from '../src/app.module';

const run = `adm${Date.now().toString(36)}`;
let app: INestApplication;
let owner: PrismaClient;
let tenantId: string;
const tokens: Record<string, string> = {};

const http = () => request(app.getHttpServer());
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

async function login(key: string, email: string, password: string) {
  const res = await http().post('/api/v1/auth/login').send({ email, password }).expect(200);
  tokens[key] = res.body.accessToken;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  owner = new PrismaClient();
  await owner.subscriptionPlan.upsert({
    where: { code: 'restaurant-ordering-monthly' },
    update: {},
    create: { code: 'restaurant-ordering-monthly', name: 'Ordering', interval: 'MONTHLY', priceInPaise: 100, moduleIds: ['qr_menu', 'online_ordering', 'kitchen_display'] },
  });
  await owner.subscriptionPlan.upsert({
    where: { code: 'digital-token-monthly' },
    update: {},
    create: { code: 'digital-token-monthly', name: 'Token', interval: 'MONTHLY', priceInPaise: 100, moduleIds: ['digital_token'] },
  });
  const adminEmail = `admin.${run}@xeva.test`;
  await owner.platformUser.create({
    data: { email: adminEmail, fullName: 'Admin', isPlatformAdmin: true, passwordHash: await bcrypt.hash('Admin#2026', 4) },
  });
  await login('admin', adminEmail, 'Admin#2026');
});

afterAll(async () => {
  await owner?.$disconnect();
  await app?.close();
});

describe('Restaurant onboarding', () => {
  it('creates the owner account and a trial in one step', async () => {
    const res = await http()
      .post('/api/v1/tenants')
      .set(as('admin'))
      .send({
        slug: `thalassery-${run}`,
        name: 'Thalassery Kitchen',
        ownerEmail: `owner.${run}@xeva.test`,
        ownerName: 'Thalassery Owner',
        planCode: 'restaurant-ordering-monthly',
        firstBranch: { code: 'TLY-01', name: 'Thalassery', city: 'Thalassery' },
      })
      .expect(201);
    tenantId = res.body.tenant.id;
    expect(res.body.subscription.status).toBe('TRIAL');
    expect(res.body.ownerTemporaryPassword).toEqual(expect.any(String));

    await login('owner', `owner.${run}@xeva.test`, res.body.ownerTemporaryPassword);
    // The trial plan covers the module, so activation is allowed.
    await http().post(`/api/v1/tenants/${tenantId}/modules`).set(as('owner')).send({ moduleId: 'qr_menu' }).expect(201);
    const sub = await http().get(`/api/v1/tenants/${tenantId}/subscription`).set(as('owner')).expect(200);
    expect(sub.body.plan.code).toBe('restaurant-ordering-monthly');
  });

  it('requires a name when the owner has no account', async () => {
    const res = await http()
      .post('/api/v1/tenants')
      .set(as('admin'))
      .send({ slug: `noname-${run}`, name: 'No Name', ownerEmail: `nobody.${run}@xeva.test`, firstBranch: { code: 'M', name: 'M' } })
      .expect(422);
    expect(res.body.error.code).toBe('OWNER_NOT_FOUND');
  });
});

describe('Team management', () => {
  it('adds employees and blocks role escalation', async () => {
    const admin = await http()
      .post(`/api/v1/tenants/${tenantId}/employees`)
      .set(as('owner'))
      .send({ email: `mgr.${run}@xeva.test`, fullName: 'Restaurant Administrator', roleKey: 'administrator' })
      .expect(201);
    expect(admin.body.temporaryPassword).toEqual(expect.any(String));
    await login('administrator', `mgr.${run}@xeva.test`, admin.body.temporaryPassword);

    // An administrator can add a cashier…
    const cashier = await http()
      .post(`/api/v1/tenants/${tenantId}/employees`)
      .set(as('administrator'))
      .send({ email: `cash.${run}@xeva.test`, fullName: 'Cashier', roleKey: 'cashier' })
      .expect(201);

    // …but cannot hand out the Owner role, or promote someone to it.
    const escalate = await http()
      .post(`/api/v1/tenants/${tenantId}/employees`)
      .set(as('administrator'))
      .send({ email: `boss.${run}@xeva.test`, fullName: 'Fake Owner', roleKey: 'owner' })
      .expect(403);
    expect(escalate.body.error.code).toBe('ROLE_EXCEEDS_YOUR_ACCESS');
    await http()
      .patch(`/api/v1/tenants/${tenantId}/employees/${cashier.body.id}`)
      .set(as('administrator'))
      .send({ roleKeys: ['owner'] })
      .expect(403);

    // The cashier cannot see the team at all.
    await login('cashier', `cash.${run}@xeva.test`, cashier.body.temporaryPassword);
    await http().get(`/api/v1/tenants/${tenantId}/employees`).set(as('cashier')).expect(403);

    const team = await http().get(`/api/v1/tenants/${tenantId}/employees`).set(as('owner')).expect(200);
    expect(team.body.map((e: { roles: { key: string }[] }) => e.roles[0].key).sort()).toEqual(['administrator', 'cashier', 'owner']);
  });

  it('disabling an employee removes their access', async () => {
    const team = await http().get(`/api/v1/tenants/${tenantId}/employees`).set(as('owner')).expect(200);
    const cashier = team.body.find((e: { roles: { key: string }[] }) => e.roles[0].key === 'cashier');
    await http().patch(`/api/v1/tenants/${tenantId}/employees/${cashier.id}`).set(as('owner')).send({ status: 'DISABLED' }).expect(200);
    await http().get('/api/v1/me/navigation').set(as('cashier')).set('X-Xeva-Tenant', tenantId).expect(403);
  });
});

describe('Xeva Super Admin', () => {
  it('is closed to restaurant users', async () => {
    await http().get('/api/v1/platform/overview').set(as('owner')).expect(403);
    await http().get(`/api/v1/platform/tenants/${tenantId}`).set(as('owner')).expect(403);
  });

  it('shows platform overview and restaurant detail', async () => {
    const overview = await http().get('/api/v1/platform/overview').set(as('admin')).expect(200);
    expect(overview.body.tenantsByStatus.ACTIVE).toBeGreaterThan(0);
    const detail = await http().get(`/api/v1/platform/tenants/${tenantId}`).set(as('admin')).expect(200);
    expect(detail.body).toMatchObject({ employeeCount: 3, installations: [expect.objectContaining({ moduleId: 'qr_menu' })] });
  });

  it('changes a plan, and the restaurant sees it', async () => {
    await http()
      .put(`/api/v1/platform/tenants/${tenantId}/subscription`)
      .set(as('admin'))
      .send({ planCode: 'digital-token-monthly', status: 'ACTIVE' })
      .expect(200);
    const sub = await http().get(`/api/v1/tenants/${tenantId}/subscription`).set(as('owner')).expect(200);
    expect(sub.body).toMatchObject({ status: 'ACTIVE', plan: { code: 'digital-token-monthly' } });
    // The new plan no longer covers ordering modules.
    await http().post(`/api/v1/tenants/${tenantId}/modules`).set(as('owner')).send({ moduleId: 'online_ordering' }).expect(402);

    const audit = await http().get('/api/v1/platform/audit-logs').set(as('admin')).expect(200);
    expect(audit.body.map((a: { action: string }) => a.action)).toContain('subscription.changed');
  });
});
