'use client';

import { Badge, Button, Card, Field, Input, PageHeader, Select, Table, Td, Toggle } from '@xeva/ui';
import { useState } from 'react';
import { Bars, DAYS, PreviewBanner, rs, Stat } from './kit';

// ───────────── Phase 4: Multi-branch (spec 9.14) ─────────────
export function Branches() {
  const branches = [
    { name: 'Kozhikode (Beach Rd)', sales: 236800, orders: 1064, rating: 4.4, food: '34.9%' },
    { name: 'Kochi (Kakkanad)', sales: 198200, orders: 902, rating: 4.2, food: '36.8%' },
    { name: 'Thrissur (Round)', sales: 121500, orders: 611, rating: 4.6, food: '33.1%' },
  ];
  const [price, setPrice] = useState({ kzd: '260', koc: '280', tcr: '250' });
  return (
    <>
      <PageHeader title="Multi-branch" description="Compare outlets, share one central menu and set branch-specific prices." />
      <PreviewBanner phase={4} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="This week by branch">
          <Table head={['Branch', 'Sales', 'Orders', 'Rating', 'Food cost']}>
            {branches.map((b) => <tr key={b.name}><Td className="font-medium">{b.name}</Td><Td className="tabular-nums">{rs(b.sales)}</Td><Td>{b.orders}</Td><Td>{b.rating} ★</Td><Td>{b.food}</Td></tr>)}
          </Table>
        </Card>
        <Card title="Branch pricing · Malabar Chicken Biryani (Full)">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kozhikode ₹"><Input type="number" value={price.kzd} onChange={(e) => setPrice({ ...price, kzd: e.target.value })} /></Field>
            <Field label="Kochi ₹"><Input type="number" value={price.koc} onChange={(e) => setPrice({ ...price, koc: e.target.value })} /></Field>
            <Field label="Thrissur ₹"><Input type="number" value={price.tcr} onChange={(e) => setPrice({ ...price, tcr: e.target.value })} /></Field>
          </div>
          <p className="mt-3 text-sm text-stone-500">Menu items, photos and Malayalam names stay in sync across branches; only prices and availability differ.</p>
        </Card>
      </div>
    </>
  );
}

// ───────────── Phase 4: Module marketplace (spec 4.4, 18 Phase 4) ─────────────
export function Marketplace() {
  const apps = [
    { name: 'Reservations', price: 799, cat: 'Customer experience', desc: 'Bookings, deposits, reminders.' },
    { name: 'CRM & Loyalty', price: 999, cat: 'Growth', desc: 'Guest profiles, points, tiers.' },
    { name: 'Marketing', price: 1299, cat: 'Growth', desc: 'WhatsApp, SMS and email campaigns.' },
    { name: 'Inventory & Procurement', price: 1499, cat: 'Operations', desc: 'Recipes, stock, purchase orders.' },
    { name: 'Staff & Attendance', price: 699, cat: 'Operations', desc: 'Shifts, check-in, leave.' },
    { name: 'Delivery', price: 1199, cat: 'Service', desc: 'Own riders, live tracking.' },
  ];
  const [cart, setCart] = useState<string[]>([]);
  return (
    <>
      <PageHeader title="Marketplace" description="Add products to your plan. Each one works on its own and connects in the Integration Centre." />
      <PreviewBanner phase={4}>Sample prices. Purchases are not processed yet.</PreviewBanner>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {apps.map((a) => (
          <Card key={a.name} title={a.name} actions={<Badge tone="gray">{a.cat}</Badge>}>
            <p className="text-sm text-stone-600">{a.desc}</p>
            <p className="mt-3 text-lg font-semibold">{rs(a.price)}<span className="text-sm font-normal text-stone-500"> / month</span></p>
            <Button className="mt-3" variant={cart.includes(a.name) ? 'secondary' : 'primary'} onClick={() => setCart((c) => (c.includes(a.name) ? c.filter((x) => x !== a.name) : [...c, a.name]))}>
              {cart.includes(a.name) ? 'Remove' : 'Add to plan'}
            </Button>
          </Card>
        ))}
      </div>
      {cart.length > 0 && (
        <Card className="mt-4">
          <p className="text-sm">Adding <b>{cart.join(', ')}</b>: {rs(apps.filter((a) => cart.includes(a.name)).reduce((s, a) => s + a.price, 0))}/month + GST, with a 14-day free trial.</p>
          <Button className="mt-3">Start trial</Button>
        </Card>
      )}
    </>
  );
}

// ───────────── Phase 4: Domain & branding (spec 4.1) ─────────────
export function Domain() {
  const [domain, setDomain] = useState('order.malabarspice.in');
  return (
    <>
      <PageHeader title="Custom domain" description="Serve your customer app on your own web address, with your logo and app icon." />
      <PreviewBanner phase={4} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Address">
          <p className="text-sm text-stone-600">Included address: <span className="font-mono">malabar-spice-house.xeva.in</span></p>
          <div className="mt-3"><Field label="Your domain"><Input value={domain} onChange={(e) => setDomain(e.target.value)} /></Field></div>
          <div className="mt-3 rounded-md bg-stone-50 p-3 font-mono text-xs">CNAME {domain || 'your.domain'} → customers.xeva.in</div>
          <p className="mt-2 text-sm"><Badge tone="amber">waiting for DNS</Badge> HTTPS certificate is issued automatically once DNS points here.</p>
        </Card>
        <Card title="App icon & install">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--brand)] text-2xl font-bold text-white">M</div>
            <div className="text-sm"><p className="font-medium">Malabar Spice</p><p className="text-stone-500">Guests can add it to their home screen.</p></div>
          </div>
          <Button variant="secondary" className="mt-3">Upload logo</Button>
        </Card>
      </div>
    </>
  );
}

// ───────────── Phase 5: Delivery (spec 18 Phase 5) ─────────────
export function Delivery() {
  const [orders, setOrders] = useState([
    { id: '#88', area: 'Nadakkavu', km: 2.1, rider: '', status: 'READY' },
    { id: '#87', area: 'Mavoor Rd', km: 3.4, rider: 'Ajmal', status: 'ON_THE_WAY' },
    { id: '#85', area: 'West Hill', km: 4.8, rider: 'Vishnu', status: 'DELIVERED' },
  ]);
  const riders = ['Ajmal', 'Vishnu', 'Nikhil'];
  return (
    <>
      <PageHeader title="Delivery" description="Dispatch your own riders, track them live and share a tracking link with the guest." />
      <PreviewBanner phase={5} />
      <div className="mb-4 grid gap-4 sm:grid-cols-3"><Stat label="Out for delivery" value={orders.filter((o) => o.status === 'ON_THE_WAY').length} /><Stat label="Avg. delivery time" value="27 min" /><Stat label="Riders available" value="2 of 3" /></div>
      <Card title="Dispatch">
        <Table head={['Order', 'Area', 'Distance', 'Rider', 'Status']}>
          {orders.map((o) => (
            <tr key={o.id}>
              <Td className="font-semibold">{o.id}</Td><Td>{o.area}</Td><Td>{o.km} km</Td>
              <Td>
                {o.status === 'READY' ? (
                  <Select aria-label={`Rider for ${o.id}`} value={o.rider} onChange={(e) => setOrders((x) => x.map((y) => (y.id === o.id ? { ...y, rider: e.target.value, status: 'ON_THE_WAY' } : y)))} className="w-32">
                    <option value="">Assign…</option>{riders.map((r) => <option key={r}>{r}</option>)}
                  </Select>
                ) : o.rider}
              </Td>
              <Td><Badge>{o.status}</Badge></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

// ───────────── Phase 5: AI insights & forecasting ─────────────
export function Insights() {
  const forecast = DAYS.map((d, i) => ({ label: d, value: [118, 104, 126, 122, 171, 236, 212][i], dashed: i >= 3 }));
  return (
    <>
      <PageHeader title="Insights" description="Forecasts and suggestions from your own sales history." />
      <PreviewBanner phase={5}>Sample forecast. Predictions need a few months of your real data.</PreviewBanner>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Expected orders this week"><Bars label="Orders: actual Mon–Wed, forecast Thu–Sun" data={forecast} /><p className="mt-2 text-xs text-stone-500">Solid: actual · light: forecast. Saturday dinner peak expected.</p></Card>
        <Card title="Suggestions">
          <ul className="space-y-3 text-sm">
            <li><b>Prep 30% more biryani on Saturday.</b> Last 6 Saturdays sold out by 21:15.</li>
            <li><b>Order chicken today.</b> Stock covers about 1.5 days at forecast demand.</li>
            <li><b>Add one waiter 19:00–22:00 Fri–Sun.</b> Average wait for service rose to 11 min.</li>
            <li><b>Kadala Curry is rarely ordered alone.</b> Try it as a parotta combo.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

// ───────────── Phase 5: Automation ─────────────
export function Automation() {
  const [rules, setRules] = useState([
    { when: 'Stock below par', then: 'Draft a purchase order to the usual supplier', on: true },
    { when: 'Guest gives 1–2 ★', then: 'Alert the manager on WhatsApp', on: true },
    { when: 'No visit in 60 days (opted in)', then: 'Send “We miss you” offer', on: false },
    { when: 'Token waiting over 30 min', then: 'Notify the host', on: true },
  ]);
  return (
    <>
      <PageHeader title="Automation" description="When something happens, Xeva does the follow-up for you." />
      <PreviewBanner phase={5} />
      <Card>
        <ul className="divide-y divide-stone-100">
          {rules.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span><span className="text-stone-500">When</span> <b>{r.when}</b> <span className="text-stone-500">→</span> {r.then}</span>
              <Toggle label={r.when} checked={r.on} onChange={(v) => setRules((x) => x.map((y, j) => (j === i ? { ...y, on: v } : y)))} />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

// ───────────── Phase 5: Franchise ─────────────
export function Franchise() {
  const outlets = [
    { name: 'Malabar Spice – Kannur', owner: 'Franchisee A', sales: 410000, royalty: 6, status: 'ACTIVE' },
    { name: 'Malabar Spice – Kottayam', owner: 'Franchisee B', sales: 288000, royalty: 6, status: 'ACTIVE' },
    { name: 'Malabar Spice – Dubai', owner: 'Franchisee C', sales: 0, royalty: 8, status: 'ONBOARDING' },
  ];
  return (
    <>
      <PageHeader title="Franchise" description="Franchise outlets, their sales and royalty due, with your standard menu and brand rules." />
      <PreviewBanner phase={5} />
      <Card title="Outlets · October">
        <Table head={['Outlet', 'Franchisee', 'Sales', 'Royalty', 'Due', 'Status']}>
          {outlets.map((o) => (
            <tr key={o.name}><Td className="font-medium">{o.name}</Td><Td>{o.owner}</Td><Td>{rs(o.sales)}</Td><Td>{o.royalty}%</Td><Td>{rs((o.sales * o.royalty) / 100)}</Td><Td><Badge>{o.status}</Badge></Td></tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
