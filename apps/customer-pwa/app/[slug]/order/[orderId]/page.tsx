'use client';

import { formatPaise, useLoad } from '@xeva/ui';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { publicApi, useRestaurant } from '../../restaurant';

interface Tracked {
  label: string;
  status: string;
  paymentStatus: string;
  tableCode: string | null;
  items: { name: string; variantName: string | null; addons: { name: string }[]; quantity: number; lineTotalPaise: number }[];
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
}

const STEPS = [
  { key: 'PLACED', label: 'Order received' },
  { key: 'PREPARING', label: 'Being prepared' },
  { key: 'READY', label: 'Ready' },
  { key: 'SERVED', label: 'Served' },
];
const RANK: Record<string, number> = { PLACED: 0, ACCEPTED: 0, PREPARING: 1, READY: 2, SERVED: 3, COMPLETED: 3 };

/** Guest's live order status (spec 4.1: customers can retrieve their order status). */
export default function OrderStatus() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const { restaurant, style } = useRestaurant(slug);
  const o = useLoad(() => publicApi<Tracked>(slug, `/orders/${orderId}`), [slug, orderId]);

  // shortcut: 8 s polling; push notifications come with the notification service.
  useEffect(() => {
    const id = setInterval(o.reload, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, orderId]);

  const d = o.data;
  const rank = d ? RANK[d.status] ?? 0 : 0;
  return (
    <main style={style} className="mx-auto min-h-screen max-w-md px-4 py-8">
      <p className="text-sm text-stone-500">{restaurant?.name}</p>
      {o.error && !d ? <p className="mt-10 text-center text-stone-600">We could not find this order.</p> : !d ? <p className="mt-10 text-center text-stone-500">Loading…</p> : (
        <>
          <h1 className="mt-1 text-2xl font-semibold">Order {d.label}{d.tableCode ? ` · Table ${d.tableCode}` : ''}</h1>
          {d.status === 'CANCELLED' ? (
            <p className="mt-6 rounded-md bg-red-50 p-4 text-red-800">This order was cancelled. Please speak to our staff.</p>
          ) : (
            <ol aria-live="polite" className="mt-6 space-y-3">
              {STEPS.map((s, i) => (
                <li key={s.key} className="flex items-center gap-3">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${i <= rank ? 'bg-[var(--brand)] text-white' : 'bg-stone-200 text-stone-500'}`}>{i < rank ? '✓' : i + 1}</span>
                  <span className={i === rank ? 'font-semibold text-stone-900' : i < rank ? 'text-stone-700' : 'text-stone-400'}>{s.label}</span>
                </li>
              ))}
            </ol>
          )}
          <section className="mt-8 rounded-xl border border-stone-200 bg-white p-4">
            <ul className="space-y-1.5 text-sm">
              {d.items.map((i, n) => (
                <li key={n} className="flex justify-between gap-3">
                  <span>{i.quantity}× {i.name}{i.variantName ? ` (${i.variantName})` : ''}{i.addons.length ? ` + ${i.addons.map((a) => a.name).join(', ')}` : ''}</span>
                  <span className="tabular-nums">{formatPaise(i.lineTotalPaise)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-sm">
              {d.discountPaise > 0 && <div className="flex justify-between"><dt>Discount</dt><dd className="tabular-nums">−{formatPaise(d.discountPaise)}</dd></div>}
              <div className="flex justify-between text-stone-600"><dt>GST</dt><dd className="tabular-nums">{formatPaise(d.taxPaise)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatPaise(d.totalPaise)}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-stone-500">{d.paymentStatus === 'PAID' ? 'Paid — thank you!' : 'Pay at the counter or ask for the bill.'}</p>
          </section>
          <button onClick={() => history.back()} className="mt-6 text-sm text-[var(--brand)] hover:underline">Back to menu</button>
        </>
      )}
    </main>
  );
}
