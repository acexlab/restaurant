/**
 * Phase 1 MVP acceptance demo (spec 20): menu → tables/QR → guest orders from phone → kitchen →
 * waiter → bill settled with GST invoice → owner reports. Plus pricing, idempotency and gating.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule, configureApp } from '../src/app.module';
import { totals } from '../src/core/orders/pricing';
import { EventDispatcher } from '../src/integration-engine/event-dispatcher.service';

const run = `mvp${Date.now().toString(36)}`;
const MODULES = ['qr_menu', 'online_ordering', 'kitchen_display', 'waiter_management', 'pos_billing'];
let app: INestApplication;
let db: PrismaClient;
let dispatcher: EventDispatcher;
let tenantId: string;
let slug: string;
let token: string;
const ids: Record<string, string> = {};

const http = () => request(app.getHttpServer());
const staff = () => ({ Authorization: `Bearer ${token}`, 'X-Xeva-Tenant': tenantId });
const pub = (p: string) => `/api/v1/public/restaurants/${slug}${p}`;
const order = async (id: string) => (await http().get(`/api/v1/orders/${id}`).set(staff()).expect(200)).body;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  db = new PrismaClient();
  dispatcher = app.get(EventDispatcher);

  await db.subscriptionPlan.upsert({ where: { code: 'mvp-all' }, update: {}, create: { code: 'mvp-all', name: 'MVP', interval: 'MONTHLY', priceInPaise: 100, moduleIds: MODULES } });
  const adminEmail = `admin.${run}@xeva.test`;
  await db.platformUser.create({ data: { email: adminEmail, fullName: 'Admin', isPlatformAdmin: true, passwordHash: await bcrypt.hash('Admin#2026', 4) } });
  const admin = (await http().post('/api/v1/auth/login').send({ email: adminEmail, password: 'Admin#2026' }).expect(200)).body.accessToken;

  slug = `kayal-${run}`;
  const t = (
    await http()
      .post('/api/v1/tenants')
      .set({ Authorization: `Bearer ${admin}` })
      .send({ slug, name: 'Kayal Kitchen', gstin: '32ABCDE1234F1Z5', ownerEmail: `owner.${run}@xeva.test`, ownerName: 'Owner', planCode: 'mvp-all', firstBranch: { code: 'M', name: 'Main', city: 'Alappuzha' } })
      .expect(201)
  ).body;
  tenantId = t.tenant.id;
  token = (await http().post('/api/v1/auth/login').send({ email: `owner.${run}@xeva.test`, password: t.ownerTemporaryPassword }).expect(200)).body.accessToken;

  for (const moduleId of MODULES) await http().post(`/api/v1/tenants/${tenantId}/modules`).set(staff()).send({ moduleId }).expect(201);
  for (const src of ['online_ordering', 'pos_billing']) {
    await http().post('/api/v1/integrations').set(staff()).send({ sourceModule: src, destinationModule: 'kitchen_display' }).expect(201);
  }
});

afterAll(async () => {
  await db?.$disconnect();
  await app?.close();
});

describe('Pricing maths', () => {
  it('applies GST per line and scales it with a discount', () => {
    expect(totals([{ unitPricePaise: 25000, quantity: 2, taxRateBps: 500 }, { unitPricePaise: 7000, quantity: 1, taxRateBps: 500 }])).toEqual({
      subtotalPaise: 57000, discountPaise: 0, taxPaise: 2850, totalPaise: 59850,
    });
    expect(totals([{ unitPricePaise: 57000, quantity: 1, taxRateBps: 500 }], 7000)).toMatchObject({ taxPaise: 2500, totalPaise: 52500 });
    expect(totals([{ unitPricePaise: 100, quantity: 1, taxRateBps: 500 }], 999)).toMatchObject({ discountPaise: 100, totalPaise: 0 });
  });
});

describe('MVP demo: restaurant set-up', () => {
  it('creates a menu and a table with a QR code', async () => {
    const cat = (await http().post('/api/v1/menu/categories').set(staff()).send({ name: 'Mains', nameMl: 'പ്രധാന വിഭവങ്ങൾ' }).expect(201)).body;
    ids.biryani = (
      await http().post('/api/v1/menu/items').set(staff())
        .send({ categoryId: cat.id, name: 'Chicken Biryani', pricePaise: 25000, isVeg: false, variants: [{ name: 'Half', pricePaise: 18000 }, { name: 'Full', pricePaise: 25000 }] })
        .expect(201)
    ).body.id;
    const soda = (
      await http().post('/api/v1/menu/items').set(staff()).send({ categoryId: cat.id, name: 'Lime Soda', pricePaise: 6000, addons: [{ name: 'Extra mint', pricePaise: 1000 }] }).expect(201)
    ).body;
    ids.soda = soda.id;
    ids.mint = soda.addons[0].id;
    ids.payasam = (await http().post('/api/v1/menu/items').set(staff()).send({ categoryId: cat.id, name: 'Payasam', pricePaise: 8000, isAvailable: false }).expect(201)).body.id;

    const menu = (await http().get('/api/v1/menu').set(staff()).expect(200)).body;
    ids.full = menu[0].items.find((i: { id: string }) => i.id === ids.biryani).variants.find((v: { name: string }) => v.name === 'Full').id;

    const table = (await http().post('/api/v1/tables').set(staff()).send({ code: 'T1', seats: 4 }).expect(201)).body;
    ids.table = table.id;
    ids.qr = table.qrToken;
    await http().post('/api/v1/tables').set(staff()).send({ code: 'T1' }).expect(409);
  });

  it('shows the public menu and table abilities without login', async () => {
    const menu = (await http().get(pub('/menu')).expect(200)).body;
    expect(menu[0].items.map((i: { name: string }) => i.name)).toEqual(['Chicken Biryani', 'Lime Soda', 'Payasam']);
    expect((await http().get(pub(`/tables/${ids.qr}`)).expect(200)).body).toEqual({ tableCode: 'T1', canOrder: true, canCallWaiter: true });
    await http().get(pub('/tables/not-a-real-token')).expect(404);
  });
});

describe('MVP demo: guest orders from the table', () => {
  const key = randomUUID();
  const cart = () => ({
    qrToken: ids.qr,
    idempotencyKey: key,
    customerName: 'Guest',
    lines: [
      { menuItemId: ids.biryani, variantId: ids.full, quantity: 2, notes: 'less spicy' },
      { menuItemId: ids.soda, addonIds: [ids.mint], quantity: 1, pricePaise: 1 }, // client price ignored
    ],
  });

  it('prices on the server and refuses unavailable items or missing options', async () => {
    await http().post(pub('/orders')).send({ ...cart(), idempotencyKey: randomUUID(), lines: [{ menuItemId: ids.payasam, quantity: 1 }] }).expect(409);
    await http().post(pub('/orders')).send({ ...cart(), idempotencyKey: randomUUID(), lines: [{ menuItemId: ids.biryani, quantity: 1 }] }).expect(400);

    const placed = (await http().post(pub('/orders')).send(cart()).expect(201)).body;
    ids.order = placed.orderId;
    // A retry of the same submit (double tap, flaky network) returns the same order.
    expect((await http().post(pub('/orders')).send(cart()).expect(201)).body.orderId).toBe(placed.orderId);

    const o = await order(ids.order);
    expect(o).toMatchObject({ status: 'PLACED', source: 'QR', tableCode: 'T1', subtotalPaise: 57000, taxPaise: 2850, totalPaise: 59850 });
    const tracked = (await http().get(pub(`/orders/${ids.order}`)).expect(200)).body;
    expect(tracked).toMatchObject({ label: o.label, status: 'PLACED', totalPaise: 59850 });
    expect(JSON.stringify(tracked)).not.toMatch(/customerPhone/);
  });

  it('reaches the kitchen through the integration and comes back ready', async () => {
    await dispatcher.drain();
    const tickets = (await http().get('/api/v1/kitchen/tickets').set(staff()).expect(200)).body;
    const ticket = tickets.find((t: { orderId: string }) => t.orderId === ids.order);
    expect(ticket).toMatchObject({ tableCode: 'T1', status: 'NEW' });
    expect(ticket.items[0]).toMatchObject({ name: 'Chicken Biryani', variantName: 'Full', quantity: 2, notes: 'less spicy' });

    await http().patch(`/api/v1/kitchen/tickets/${ticket.id}`).set(staff()).send({ status: 'PREPARING' }).expect(200);
    await dispatcher.drain();
    expect((await order(ids.order)).status).toBe('PREPARING');

    await http().patch(`/api/v1/kitchen/tickets/${ticket.id}`).set(staff()).send({ status: 'READY' }).expect(200);
    await dispatcher.drain();
    expect((await order(ids.order)).status).toBe('READY');
    await dispatcher.drain(); // replaying never moves it backwards
    expect((await order(ids.order)).status).toBe('READY');
  });

  it('notifies the waiter, who serves it; the guest can call for the bill', async () => {
    await http().post(pub(`/tables/${ids.qr}/requests`)).send({ type: 'BILL' }).expect(201);
    await http().post(pub(`/tables/${ids.qr}/requests`)).send({ type: 'BILL' }).expect(201); // de-duplicated
    const board = (await http().get('/api/v1/waiter/board').set(staff()).expect(200)).body;
    expect(board.ready.map((o: { id: string }) => o.id)).toContain(ids.order);
    expect(board.requests.filter((r: { type: string }) => r.type === 'BILL')).toHaveLength(1);
    await http().post(`/api/v1/waiter/requests/${board.requests[0].id}/resolve`).set(staff()).expect(200);

    await http().post(`/api/v1/waiter/orders/${ids.order}/served`).set(staff()).expect(200);
    expect((await order(ids.order)).status).toBe('SERVED');
    // Served is not paid.
    expect((await http().patch(`/api/v1/orders/${ids.order}/status`).set(staff()).send({ status: 'COMPLETED' }).expect(409)).body.error.code).toBe('NOT_PAID');
  });

  it('cashier discounts, takes a split payment and issues a GST invoice', async () => {
    expect((await http().get('/api/v1/pos/orders').set(staff()).expect(200)).body.map((o: { id: string }) => o.id)).toContain(ids.order);

    const d = (await http().post(`/api/v1/pos/orders/${ids.order}/discount`).set(staff()).send({ discountPaise: 7000, reason: 'Regular guest' }).expect(200)).body;
    expect(d).toMatchObject({ discountPaise: 7000, taxPaise: 2500, totalPaise: 52500 });

    await http().post(`/api/v1/pos/orders/${ids.order}/payments`).set(staff()).send({ method: 'CARD', amountPaise: 99999999 }).expect(400); // card can't overpay
    const upi = (await http().post(`/api/v1/pos/orders/${ids.order}/payments`).set(staff()).send({ method: 'UPI', amountPaise: 20000, reference: 'UPI123' }).expect(201)).body;
    expect(upi.balancePaise).toBe(32500);
    await http().post(`/api/v1/pos/orders/${ids.order}/discount`).set(staff()).send({ discountPaise: 1, reason: 'after payment' }).expect(409);

    const cash = (await http().post(`/api/v1/pos/orders/${ids.order}/payments`).set(staff()).send({ method: 'CASH', amountPaise: 40000 }).expect(201)).body;
    expect(cash).toMatchObject({ balancePaise: 0, changePaise: 7500 });
    expect(cash.order.invoiceNumber).toMatch(/^INV\/\d{4}-\d{2}\/000001$/);
    await http().post(`/api/v1/pos/orders/${ids.order}/payments`).set(staff()).send({ method: 'CASH', amountPaise: 100 }).expect(409); // no double charge

    expect(await order(ids.order)).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PAID' });
    const inv = (await http().get(`/api/v1/pos/orders/${ids.order}/invoice`).set(staff()).expect(200)).body;
    expect(inv).toMatchObject({ seller: { name: 'Kayal Kitchen', gstin: '32ABCDE1234F1Z5' }, cgstPaise: 1250, sgstPaise: 1250, totalPaise: 52500 });
  });

  it('owner sees it in the closing report, with events and audit trail', async () => {
    const r = (await http().get('/api/v1/pos/closing-report').set(staff()).expect(200)).body;
    expect(r).toMatchObject({ ordersPaid: 1, grossSalesPaise: 57000, discountsPaise: 7000, taxPaise: 2500, netCollectedPaise: 52500, byMethod: { UPI: 20000, CASH: 32500, CARD: 0 } });

    const events = (await db.outboxEvent.findMany({ where: { tenantId, entityId: ids.order } })).map((e) => e.eventName);
    expect(events).toEqual(expect.arrayContaining(['order.created', 'order.updated', 'payment.completed', 'order.completed']));
    const audit = (await http().get('/api/v1/audit-logs').set(staff()).expect(200)).body.items.map((a: { action: string }) => a.action);
    expect(audit).toContain('order.discounted');
  });

  it('refunds are recorded, not deleted', async () => {
    await http().post(`/api/v1/pos/orders/${ids.order}/refund`).set(staff()).send({ reason: 'Wrong dish' }).expect(200);
    expect((await order(ids.order)).paymentStatus).toBe('REFUNDED');
    expect(await db.payment.count({ where: { orderId: ids.order } })).toBe(2);
    expect((await http().get('/api/v1/pos/closing-report').set(staff()).expect(200)).body.refundsPaise).toBe(52500);
  });
});

describe('Counter and takeaway orders', () => {
  it('a prepaid takeaway closes itself when the kitchen marks it ready', async () => {
    const o = (
      await http().post('/api/v1/orders').set(staff()).send({ source: 'POS', type: 'TAKEAWAY', lines: [{ menuItemId: ids.soda, quantity: 2 }] }).expect(201)
    ).body;
    expect(o.label).toBe('#2');
    await http().post(`/api/v1/pos/orders/${o.id}/payments`).set(staff()).send({ method: 'CASH', amountPaise: o.totalPaise }).expect(201);
    await dispatcher.drain();
    const ticket = (await http().get('/api/v1/kitchen/tickets').set(staff()).expect(200)).body.find((t: { orderId: string }) => t.orderId === o.id);
    await http().patch(`/api/v1/kitchen/tickets/${ticket.id}`).set(staff()).send({ status: 'READY' }).expect(200);
    await dispatcher.drain();
    expect(await order(o.id)).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PAID' });
  });

  it('cancelling an unpaid order also cancels its kitchen ticket', async () => {
    const o = (await http().post('/api/v1/orders').set(staff()).send({ source: 'POS', lines: [{ menuItemId: ids.soda, quantity: 1 }] }).expect(201)).body;
    await dispatcher.drain();
    await http().post(`/api/v1/orders/${o.id}/cancel`).set(staff()).send({ reason: 'Guest left' }).expect(200);
    await dispatcher.drain();
    const active = (await http().get('/api/v1/kitchen/tickets').set(staff()).expect(200)).body;
    expect(active.find((t: { orderId: string }) => t.orderId === o.id)).toBeUndefined();
  });
});

describe('Gating', () => {
  it('turning off table ordering stops QR orders but keeps the menu browsable', async () => {
    await http().patch(`/api/v1/tenants/${tenantId}/modules/online_ordering`).set(staff()).send({ features: { dine_in: false } }).expect(200);
    expect((await http().get(pub(`/tables/${ids.qr}`)).expect(200)).body.canOrder).toBe(false);
    await http().post(pub('/orders')).send({ qrToken: ids.qr, idempotencyKey: randomUUID(), lines: [{ menuItemId: ids.soda, quantity: 1 }] }).expect(403);
    await http().get(pub('/menu')).expect(200);
  });

  it('a staff order needs its source module active', async () => {
    await http().patch(`/api/v1/tenants/${tenantId}/modules/waiter_management`).set(staff()).send({ status: 'INACTIVE' }).expect(200);
    const res = await http().post('/api/v1/orders').set(staff()).send({ source: 'WAITER', lines: [{ menuItemId: ids.soda, quantity: 1 }] }).expect(403);
    expect(res.body.error.code).toBe('MODULE_NOT_ACTIVE');
    await http().get('/api/v1/waiter/board').set(staff()).expect(403);
  });
});
