'use client';

import type { ReactNode } from 'react';

/**
 * Shared pieces for Phase 2–5 prototype screens. Everything here is sample data held in page
 * state: nothing is saved. Each screen gets wired to its real API when its phase is built.
 */
export function PreviewBanner({ phase, children }: { phase: number; children?: ReactNode }) {
  return (
    <div role="note" className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-sky-300 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
      <span className="rounded-full bg-sky-600 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">Preview · Phase {phase}</span>
      <span>{children ?? 'Sample data. Changes are not saved yet.'}</span>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-sm text-stone-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'bad' ? 'text-red-700' : tone === 'good' ? 'text-emerald-700' : 'text-stone-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-stone-500">{sub}</p>}
    </div>
  );
}

/** Minimal accessible bar chart (no chart library). */
export function Bars({ data, format = String, height = 160, label }: { data: { label: string; value: number; dashed?: boolean }[]; format?: (v: number) => string; height?: number; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / data.length;
  return (
    <figure>
      <svg role="img" aria-label={label} viewBox={`0 0 100 ${height / 4}`} preserveAspectRatio="none" className="h-40 w-full">
        {data.map((d, i) => {
          const h = (d.value / max) * (height / 4 - 2);
          return (
            <rect key={d.label} x={i * w + w * 0.15} y={height / 4 - h} width={w * 0.7} height={h} rx={0.6}
              className={d.dashed ? 'fill-sky-300' : 'fill-[var(--brand)]'} opacity={d.dashed ? 0.8 : 1}>
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex text-[10px] text-stone-500">
        {data.map((d) => <span key={d.label} className="flex-1 truncate text-center">{d.label}</span>)}
      </figcaption>
    </figure>
  );
}

export const rs = (rupees: number) => `₹${rupees.toLocaleString('en-IN')}`;
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const CUSTOMERS = [
  { id: 'c1', name: 'Anjali Menon', phone: '98470 11223', visits: 14, spend: 18450, points: 920, tier: 'Gold', last: '2 days ago', consent: true },
  { id: 'c2', name: 'Faisal Rahman', phone: '94460 55871', visits: 9, spend: 11200, points: 560, tier: 'Silver', last: '1 week ago', consent: true },
  { id: 'c3', name: 'Joseph Kurian', phone: '90370 22019', visits: 22, spend: 31800, points: 1590, tier: 'Platinum', last: 'Yesterday', consent: false },
  { id: 'c4', name: 'Lakshmi Nair', phone: '97450 66330', visits: 3, spend: 2650, points: 130, tier: 'Member', last: '3 weeks ago', consent: true },
  { id: 'c5', name: 'Muhammed Shafi', phone: '95390 40112', visits: 6, spend: 7300, points: 365, tier: 'Silver', last: '5 days ago', consent: true },
  { id: 'c6', name: 'Sneha Pillai', phone: '98950 73004', visits: 1, spend: 980, points: 49, tier: 'Member', last: 'Today', consent: false },
];

export const STAFF = [
  { id: 's1', name: 'Rajesh K', role: 'Head Chef', shift: '10:00–18:00', in: '09:52', status: 'On duty' },
  { id: 's2', name: 'Fathima N', role: 'Cashier', shift: '11:00–19:00', in: '11:04', status: 'On duty' },
  { id: 's3', name: 'Arun Das', role: 'Waiter', shift: '12:00–22:00', in: '—', status: 'Late' },
  { id: 's4', name: 'Bincy Thomas', role: 'Waiter', shift: '12:00–22:00', in: '11:58', status: 'On duty' },
  { id: 's5', name: 'Suresh P', role: 'Storekeeper', shift: '08:00–16:00', in: '—', status: 'On leave' },
];

export const INGREDIENTS = [
  { id: 'i1', name: 'Basmati rice', unit: 'kg', stock: 18, par: 25, cost: 120, expiry: '—' },
  { id: 'i2', name: 'Chicken (curry cut)', unit: 'kg', stock: 6, par: 15, cost: 240, expiry: 'Tomorrow' },
  { id: 'i3', name: 'Coconut oil', unit: 'L', stock: 22, par: 10, cost: 210, expiry: '—' },
  { id: 'i4', name: 'Maida (parotta flour)', unit: 'kg', stock: 40, par: 30, cost: 45, expiry: '—' },
  { id: 'i5', name: 'Shallots', unit: 'kg', stock: 3, par: 8, cost: 90, expiry: '4 days' },
  { id: 'i6', name: 'Beef', unit: 'kg', stock: 9, par: 10, cost: 380, expiry: '2 days' },
];

export const SUPPLIERS = [
  { id: 'p1', name: 'Kozhikode Meat Traders', items: 'Chicken, beef', phone: '0495 270 1122', gstin: '32AABCK1234M1Z2' },
  { id: 'p2', name: 'Malabar Rice Mills', items: 'Rice, flour', phone: '0495 230 8890', gstin: '32AACFM5566L1Z9' },
  { id: 'p3', name: 'Green Valley Vegetables', items: 'Vegetables, shallots', phone: '98460 31415', gstin: '—' },
];

export const HOURLY = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map((h, i) => ({
  label: `${h}`,
  value: [2, 4, 3, 6, 18, 31, 24, 9, 7, 10, 16, 27, 34, 26, 11][i],
}));
