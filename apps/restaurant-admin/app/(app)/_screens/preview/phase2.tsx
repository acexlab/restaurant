'use client';

import { Badge, Button, Card, Field, Input, PageHeader, Select, Table, Td, Toggle } from '@xeva/ui';
import { useState, type FormEvent } from 'react';
import { CUSTOMERS, PreviewBanner, rs, Stat } from './kit';

// ───────────── Reservations (spec 9.2) ─────────────
const SLOTS = ['12:00', '12:30', '13:00', '13:30', '19:00', '19:30', '20:00', '20:30', '21:00'];
const initialBookings = [
  { id: 'r1', name: 'Anjali Menon', guests: 4, time: '13:00', table: 'T3', status: 'CONFIRMED', note: 'Birthday', deposit: 0 },
  { id: 'r2', name: 'Faisal Rahman', guests: 2, time: '19:30', table: 'T1', status: 'CONFIRMED', note: '', deposit: 0 },
  { id: 'r3', name: 'Office party (Infopark)', guests: 12, time: '20:00', table: 'T5+T6', status: 'PENDING', note: 'Needs projector', deposit: 2000 },
  { id: 'r4', name: 'Lakshmi Nair', guests: 3, time: '12:30', table: 'T2', status: 'NO_SHOW', note: '', deposit: 0 },
];

export function Reservations() {
  const [bookings, setBookings] = useState(initialBookings);
  const [form, setForm] = useState({ name: '', guests: '2', time: '19:00' });
  const set = (id: string, status: string) => setBookings((b) => b.map((x) => (x.id === id ? { ...x, status } : x)));
  const add = (e: FormEvent) => {
    e.preventDefault();
    setBookings((b) => [...b, { id: crypto.randomUUID(), name: form.name, guests: Number(form.guests), time: form.time, table: 'Auto', status: 'CONFIRMED', note: '', deposit: 0 }]);
    setForm({ name: '', guests: '2', time: '19:00' });
  };
  const covers = bookings.filter((b) => b.status !== 'CANCELLED' && b.status !== 'NO_SHOW').reduce((s, b) => s + b.guests, 0);

  return (
    <>
      <PageHeader title="Reservations" description="Today's bookings by time slot, with reminders, deposits and no-show tracking." />
      <PreviewBanner phase={2} />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Bookings today" value={bookings.length} />
        <Stat label="Expected guests" value={covers} />
        <Stat label="Deposits held" value={rs(bookings.reduce((s, b) => s + b.deposit, 0))} />
        <Stat label="No-shows (30 days)" value="6%" sub="Reminder SMS cuts this" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card title="Today">
          <ol className="space-y-2">
            {SLOTS.map((slot) => {
              const at = bookings.filter((b) => b.time === slot);
              return (
                <li key={slot} className="flex gap-3">
                  <span className="w-12 shrink-0 pt-2 text-sm tabular-nums text-stone-500">{slot}</span>
                  <div className="flex-1 space-y-1.5">
                    {at.length === 0 && <div className="rounded-md border border-dashed border-stone-200 py-2 text-center text-xs text-stone-400">free</div>}
                    {at.map((b) => (
                      <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm">
                        <span><span className="font-medium">{b.name}</span> · {b.guests} guests · {b.table}{b.note && <span className="text-amber-800"> · {b.note}</span>}</span>
                        <span className="flex items-center gap-1">
                          <Badge>{b.status}</Badge>
                          {b.status === 'PENDING' && <Button variant="ghost" onClick={() => set(b.id, 'CONFIRMED')}>Confirm</Button>}
                          {b.status === 'CONFIRMED' && <Button variant="ghost" onClick={() => set(b.id, 'SEATED')}>Seat</Button>}
                          {b.status === 'CONFIRMED' && <Button variant="ghost" onClick={() => set(b.id, 'NO_SHOW')}>No-show</Button>}
                        </span>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
        <div className="space-y-4">
          <Card title="New booking">
            <form onSubmit={add} className="space-y-3">
              <Field label="Guest name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Guests"><Input type="number" min={1} max={40} value={form.guests} onChange={(e) => setForm({ ...form, guests: e.target.value })} /></Field>
                <Field label="Time"><Select value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })}>{SLOTS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
              </div>
              <Button type="submit" className="w-full">Book</Button>
            </form>
          </Card>
          <Card title="Rules">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between">Slot length <span>30 min</span></li>
              <li className="flex justify-between">Deposit for groups of <span>8+ guests · ₹200/head</span></li>
              <li className="flex justify-between">Free cancellation until <span>3 h before</span></li>
              <li className="flex justify-between">Reminder <span>SMS 2 h before</span></li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

// ───────────── Floor plan / table management (spec 9.8) ─────────────
const initialFloor = [
  { code: 'T1', seats: 2, x: 1, y: 1, state: 'free' }, { code: 'T2', seats: 4, x: 2, y: 1, state: 'seated' },
  { code: 'T3', seats: 4, x: 3, y: 1, state: 'reserved' }, { code: 'T4', seats: 4, x: 1, y: 2, state: 'bill' },
  { code: 'T5', seats: 6, x: 2, y: 2, state: 'free' }, { code: 'T6', seats: 6, x: 3, y: 2, state: 'cleaning' },
];
const STATE = { free: 'bg-emerald-50 border-emerald-300', seated: 'bg-amber-50 border-amber-300', reserved: 'bg-sky-50 border-sky-300', bill: 'bg-violet-50 border-violet-300', cleaning: 'bg-stone-100 border-stone-300' } as const;
const CYCLE = ['free', 'seated', 'bill', 'cleaning'] as const;

export function FloorPlan() {
  const [floor, setFloor] = useState(initialFloor);
  const tap = (code: string) =>
    setFloor((f) => f.map((t) => (t.code === code ? { ...t, state: CYCLE[(CYCLE.indexOf(t.state as (typeof CYCLE)[number]) + 1) % CYCLE.length] ?? 'free' } : t)));
  return (
    <>
      <PageHeader title="Floor plan" description="Live table status. Tap a table to move it along: free → seated → bill → cleaning." />
      <PreviewBanner phase={2} />
      <Card>
        <div className="grid grid-cols-3 gap-4 sm:gap-6">
          {floor.map((t) => (
            <button key={t.code} onClick={() => tap(t.code)} className={`flex aspect-[4/3] flex-col items-center justify-center rounded-xl border-2 ${STATE[t.state as keyof typeof STATE]}`}>
              <span className="text-2xl font-bold">{t.code}</span>
              <span className="text-xs text-stone-600">{t.seats} seats · {t.state}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 flex flex-wrap gap-3 text-xs text-stone-600">
          {Object.keys(STATE).map((s) => <span key={s} className="flex items-center gap-1"><span className={`h-3 w-3 rounded border-2 ${STATE[s as keyof typeof STATE]}`} />{s}</span>)}
        </p>
        <div className="mt-4 flex gap-2"><Button variant="secondary">Merge T5 + T6</Button><Button variant="secondary">Transfer T2 → T1</Button></div>
      </Card>
    </>
  );
}

// ───────────── Customers / CRM (spec 9.9) ─────────────
export function Customers() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = CUSTOMERS.filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase()));
  const c = CUSTOMERS.find((x) => x.id === open);
  return (
    <>
      <PageHeader title="Customers" description="Every guest who ordered, booked or joined the queue: visits, spend, loyalty and consent." />
      <PreviewBanner phase={2} />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Customers" value="1,284" />
        <Stat label="Repeat guests" value="38%" tone="good" />
        <Stat label="Avg. spend / visit" value={rs(612)} />
        <Stat label="Marketing consent" value="71%" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card actions={<Input aria-label="Search customers" placeholder="Search name or phone" className="w-56" value={q} onChange={(e) => setQ(e.target.value)} />} title="Guests">
          <Table head={['Name', 'Visits', 'Spend', 'Tier', 'Last visit']}>
            {list.map((x) => (
              <tr key={x.id} className="cursor-pointer hover:bg-stone-50" onClick={() => setOpen(x.id)}>
                <Td><span className="font-medium text-stone-900">{x.name}</span><div className="text-xs text-stone-500">{x.phone}</div></Td>
                <Td>{x.visits}</Td><Td>{rs(x.spend)}</Td><Td><Badge tone={x.tier === 'Platinum' ? 'blue' : x.tier === 'Gold' ? 'amber' : 'gray'}>{x.tier}</Badge></Td><Td>{x.last}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title={c ? c.name : 'Guest profile'}>
          {!c ? <p className="text-sm text-stone-500">Select a guest.</p> : (
            <div className="space-y-2 text-sm">
              <p className="text-stone-600">{c.phone}</p>
              <p>{c.visits} visits · {rs(c.spend)} spent · {c.points} points</p>
              <p>Favourite: Malabar Chicken Biryani (Full)</p>
              <p>Promotions: {c.consent ? <Badge tone="green">opted in</Badge> : <Badge tone="gray">not opted in</Badge>}</p>
              <div className="flex gap-2 pt-2"><Button variant="secondary">Add note</Button><Button variant="secondary">Gift 100 points</Button></div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

// ───────────── Loyalty (spec 9.9) ─────────────
export function Loyalty() {
  const [rate, setRate] = useState('5');
  const [enabled, setEnabled] = useState(true);
  return (
    <>
      <PageHeader title="Loyalty & rewards" description="Points on every bill, tiers for regulars, rewards they can redeem at the counter." />
      <PreviewBanner phase={2} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Earning" actions={<Toggle label="Loyalty on" checked={enabled} onChange={setEnabled} />}>
          <div className="space-y-3 text-sm">
            <Field label="Points per ₹100 spent"><Input type="number" min={1} max={50} value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
            <p className="text-stone-600">A ₹1,000 bill earns <b>{Number(rate) * 10} points</b>. 1 point = ₹0.10 off.</p>
          </div>
        </Card>
        <Card title="Tiers">
          <Table head={['Tier', 'After', 'Perk']}>
            {[['Member', 'Sign-up', '—'], ['Silver', '5 visits', '5% off desserts'], ['Gold', '₹10,000 spend', 'Free Sulaimani every visit'], ['Platinum', '₹25,000 spend', 'Priority table + 10% off']].map(([t, a, p]) => (
              <tr key={t}><Td className="font-medium">{t}</Td><Td>{a}</Td><Td>{p}</Td></tr>
            ))}
          </Table>
        </Card>
        <Card title="Rewards catalogue">
          <ul className="divide-y divide-stone-100 text-sm">
            {[['Free Pazhampori', 300], ['₹100 off', 1000], ['Biryani for two', 4500]].map(([n, p]) => (
              <li key={n} className="flex justify-between py-2"><span>{n}</span><span className="tabular-nums text-stone-500">{p} pts</span></li>
            ))}
          </ul>
        </Card>
        <Card title="This month">
          <div className="grid grid-cols-2 gap-3"><Stat label="Points earned" value="48,210" /><Stat label="Redeemed" value="12,900" sub="₹1,290 in rewards" /></div>
        </Card>
      </div>
    </>
  );
}

// ───────────── Marketing (spec 9.10) ─────────────
const initialCampaigns = [
  { id: 'm1', name: 'Onam Sadya pre-booking', channel: 'WhatsApp', audience: 'Gold + Platinum', sent: 412, opened: '68%', status: 'SENT' },
  { id: 'm2', name: 'Weekday lunch combo', channel: 'SMS', audience: 'Visited in last 60 days', sent: 0, opened: '—', status: 'DRAFT' },
  { id: 'm3', name: 'We miss you', channel: 'Email', audience: 'No visit in 90 days', sent: 0, opened: '—', status: 'SCHEDULED' },
];
export function Marketing() {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [form, setForm] = useState({ name: '', channel: 'WhatsApp', audience: 'All opted-in guests' });
  const reach = form.audience === 'All opted-in guests' ? 912 : form.audience === 'Gold + Platinum' ? 140 : 386;
  return (
    <>
      <PageHeader title="Marketing" description="Campaigns go only to guests who opted in. Transactional messages (order ready, token called) are separate." />
      <PreviewBanner phase={2} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card title="Campaigns">
          <Table head={['Campaign', 'Channel', 'Audience', 'Sent', 'Opened', 'Status']}>
            {campaigns.map((c) => (
              <tr key={c.id}><Td className="font-medium text-stone-900">{c.name}</Td><Td>{c.channel}</Td><Td>{c.audience}</Td><Td>{c.sent}</Td><Td>{c.opened}</Td><Td><Badge>{c.status}</Badge></Td></tr>
            ))}
          </Table>
        </Card>
        <Card title="New campaign">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setCampaigns((c) => [...c, { id: crypto.randomUUID(), ...form, sent: 0, opened: '—', status: 'DRAFT' }]);
              setForm({ ...form, name: '' });
            }}
            className="space-y-3"
          >
            <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Channel"><Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}><option>WhatsApp</option><option>SMS</option><option>Email</option></Select></Field>
            <Field label="Audience">
              <Select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
                <option>All opted-in guests</option><option>Gold + Platinum</option><option>Visited in last 60 days</option>
              </Select>
            </Field>
            <p className="text-sm text-stone-600">Reaches <b>{reach}</b> opted-in guests. Unsubscribe link added automatically.</p>
            <Button type="submit" className="w-full">Save draft</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

// ───────────── Feedback (spec 4.1, 9.9) ─────────────
export function Feedback() {
  const reviews = [
    { who: 'Anjali M', stars: 5, text: 'Biryani was perfect, quick service.', when: 'Today' },
    { who: 'Guest at T4', stars: 3, text: 'Food good but waited 25 min for parotta.', when: 'Yesterday' },
    { who: 'Joseph K', stars: 4, text: 'Loved the Sulaimani. Parking is hard.', when: '2 days ago' },
  ];
  return (
    <>
      <PageHeader title="Feedback" description="Ratings guests leave after paying, from their phone." />
      <PreviewBanner phase={2} />
      <div className="mb-4 grid gap-4 sm:grid-cols-3"><Stat label="Average rating" value="4.4 ★" tone="good" /><Stat label="Responses (30 days)" value="186" /><Stat label="Needs reply" value="3" tone="bad" /></div>
      <Card title="Latest">
        <ul className="divide-y divide-stone-100">
          {reviews.map((r, i) => (
            <li key={i} className="py-3 text-sm">
              <p><span aria-label={`${r.stars} out of 5 stars`} className="text-amber-500">{'★'.repeat(r.stars)}<span className="text-stone-300">{'★'.repeat(5 - r.stars)}</span></span> <span className="font-medium">{r.who}</span> <span className="text-stone-500">· {r.when}</span></p>
              <p className="mt-1 text-stone-700">{r.text}</p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
