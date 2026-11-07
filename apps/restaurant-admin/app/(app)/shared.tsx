'use client';

import { Badge, Button, Field, formatPaise, Input, Select, useAction, useLoad } from '@xeva/ui';
import { useEffect, useMemo, useState } from 'react';

// Customer-facing app (QR menu, queue display). Set NEXT_PUBLIC_CUSTOMER_URL in production.
export const CUSTOMER_URL = process.env.NEXT_PUBLIC_CUSTOMER_URL ?? 'http://localhost:3010';

export interface Option { id: string; name: string; pricePaise: number }
export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  nameMl: string | null;
  description: string | null;
  pricePaise: number;
  taxRateBps: number;
  isVeg: boolean;
  isAvailable: boolean;
  variants: Option[];
  addons: Option[];
}
export interface MenuCategory { id: string; name: string; nameMl: string | null; isActive: boolean; items: MenuItem[] }
export interface Table { id: string; code: string; seats: number; qrToken: string; isActive: boolean; assignedEmployeeId: string | null }
export interface OrderItem { id: string; name: string; variantName: string | null; addons: { name: string }[]; quantity: number; unitPricePaise: number; lineTotalPaise: number; notes: string | null }
export interface Payment { id: string; method: string; amountPaise: number; reference: string | null; refundedAt: string | null }
export interface Order {
  id: string;
  label: string;
  type: 'DINE_IN' | 'TAKEAWAY';
  source: string;
  status: string;
  paymentStatus: string;
  tableCode: string | null;
  customerName: string | null;
  notes: string | null;
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  invoiceNumber: string | null;
  createdAt: string;
  items: OrderItem[];
  payments?: Payment[];
}
export type Call = <T>(path: string, opts?: { method?: 'POST' | 'PATCH' | 'DELETE' | 'PUT'; body?: unknown }) => Promise<T>;

export const minutesSince = (iso: string) => Math.max(0, Math.floor((Date.now() - +new Date(iso)) / 60000));
export const rupees = (s: string) => Math.round(Number(s) * 100);
export const itemLine = (i: Pick<OrderItem, 'name' | 'variantName' | 'addons'>) =>
  [i.name, i.variantName && `(${i.variantName})`, i.addons?.length ? `+ ${i.addons.map((a) => a.name).join(', ')}` : null].filter(Boolean).join(' ');

// shortcut: screens poll; switch to WebSocket push (spec 13) when the realtime gateway exists.
export function usePolling(reload: () => void, ms = 5000) {
  useEffect(() => {
    const id = setInterval(reload, ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

interface CartLine { key: string; item: MenuItem; variant?: Option; addons: Option[]; quantity: number }
const unit = (l: CartLine) => (l.variant?.pricePaise ?? l.item.pricePaise) + l.addons.reduce((s, a) => s + a.pricePaise, 0);

/** Order entry used by POS and Waiter screens. The server re-prices everything. */
export function OrderComposer({ source, call, onPlaced }: { source: 'POS' | 'WAITER'; call: Call; onPlaced: (o: Order) => void }) {
  const action = useAction();
  const data = useLoad(async () => {
    const [menu, tables] = await Promise.all([call<MenuCategory[]>('/menu'), call<Table[]>('/tables').catch(() => [] as Table[])]);
    return { menu: menu.filter((c) => c.isActive), tables: tables.filter((t) => t.isActive) };
  }, []);
  const [category, setCategory] = useState<string | null>(null);
  const [picking, setPicking] = useState<{ item: MenuItem; variant?: Option; addons: Option[] } | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [type, setType] = useState<'DINE_IN' | 'TAKEAWAY'>(source === 'POS' ? 'TAKEAWAY' : 'DINE_IN');
  const [tableId, setTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());

  const cats = data.data?.menu ?? [];
  const current = cats.find((c) => c.id === category) ?? cats[0];
  const total = useMemo(() => cart.reduce((s, l) => s + unit(l) * l.quantity, 0), [cart]);

  const add = (item: MenuItem, variant?: Option, addons: Option[] = []) => {
    const k = [item.id, variant?.id, ...addons.map((a) => a.id).sort()].join('|');
    setCart((c) => (c.some((l) => l.key === k) ? c.map((l) => (l.key === k ? { ...l, quantity: l.quantity + 1 } : l)) : [...c, { key: k, item, variant, addons, quantity: 1 }]));
    setPicking(null);
  };
  const tap = (item: MenuItem) => (item.variants.length || item.addons.length ? setPicking({ item, variant: item.variants[0], addons: [] }) : add(item));
  const qty = (k: string, d: number) => setCart((c) => c.map((l) => (l.key === k ? { ...l, quantity: l.quantity + d } : l)).filter((l) => l.quantity > 0));

  const place = () =>
    action.run(async () => {
      const o = await call<Order>('/orders', {
        method: 'POST',
        body: {
          source,
          type,
          tableId: type === 'DINE_IN' && tableId ? tableId : undefined,
          customerName: customerName.trim() || undefined,
          idempotencyKey: key,
          lines: cart.map((l) => ({ menuItemId: l.item.id, variantId: l.variant?.id, addonIds: l.addons.map((a) => a.id), quantity: l.quantity })),
        },
      });
      setCart([]);
      setCustomerName('');
      setKey(crypto.randomUUID());
      onPlaced(o);
    });

  if (!data.data) return <p className="text-sm text-stone-500">Loading menu…</p>;
  if (cats.length === 0) return <p className="text-sm text-stone-500">The menu is empty. Add items in Menu Management first.</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div>
        <div className="mb-3 flex gap-1 overflow-x-auto">
          {cats.map((c) => (
            <Button key={c.id} variant={c.id === current?.id ? 'primary' : 'secondary'} onClick={() => setCategory(c.id)}>{c.name}</Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {current?.items.map((i) => (
            <button
              key={i.id}
              disabled={!i.isAvailable}
              onClick={() => tap(i)}
              className="min-h-16 rounded-md border border-stone-200 bg-white p-2 text-left text-sm hover:border-[var(--brand)] disabled:opacity-40"
            >
              <span className="font-medium">{i.name}</span>
              <span className="block text-xs text-stone-500">{formatPaise(i.variants[0]?.pricePaise ?? i.pricePaise)}{i.isAvailable ? '' : ' · sold out'}</span>
            </button>
          ))}
        </div>
        {picking && (
          <div className="mt-3 rounded-md border border-stone-200 bg-white p-3 text-sm">
            <p className="font-medium">{picking.item.name}</p>
            {picking.item.variants.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {picking.item.variants.map((v) => (
                  <Button key={v.id} variant={picking.variant?.id === v.id ? 'primary' : 'secondary'} onClick={() => setPicking({ ...picking, variant: v })}>
                    {v.name} {formatPaise(v.pricePaise)}
                  </Button>
                ))}
              </div>
            )}
            {picking.item.addons.map((a) => (
              <label key={a.id} className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={picking.addons.some((x) => x.id === a.id)}
                  onChange={(e) => setPicking({ ...picking, addons: e.target.checked ? [...picking.addons, a] : picking.addons.filter((x) => x.id !== a.id) })}
                />
                {a.name} (+{formatPaise(a.pricePaise)})
              </label>
            ))}
            <div className="mt-3 flex gap-2">
              <Button onClick={() => add(picking.item, picking.variant, picking.addons)}>Add</Button>
              <Button variant="ghost" onClick={() => setPicking(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-md border border-stone-200 bg-white p-3">
        <div className="mb-3 flex gap-2">
          <Button variant={type === 'DINE_IN' ? 'primary' : 'secondary'} onClick={() => setType('DINE_IN')}>Dine-in</Button>
          <Button variant={type === 'TAKEAWAY' ? 'primary' : 'secondary'} onClick={() => setType('TAKEAWAY')}>Takeaway</Button>
        </div>
        {type === 'DINE_IN' && (
          <Field label="Table">
            <Select value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="">No table</option>
              {data.data.tables.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}
            </Select>
          </Field>
        )}
        <div className="mt-2"><Field label="Guest name (optional)"><Input value={customerName} maxLength={80} onChange={(e) => setCustomerName(e.target.value)} /></Field></div>
        <ul className="my-3 divide-y divide-stone-100 text-sm">
          {cart.length === 0 && <li className="py-2 text-stone-500">Tap items to add them.</li>}
          {cart.map((l) => (
            <li key={l.key} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">{itemLine({ name: l.item.name, variantName: l.variant?.name ?? null, addons: l.addons })}</span>
              <span className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" aria-label={`Remove one ${l.item.name}`} onClick={() => qty(l.key, -1)}>−</Button>
                <span className="w-5 text-center tabular-nums">{l.quantity}</span>
                <Button variant="ghost" aria-label={`Add one ${l.item.name}`} onClick={() => qty(l.key, 1)}>+</Button>
              </span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between text-sm font-medium"><span>Before GST</span><span className="tabular-nums">{formatPaise(total)}</span></p>
        {action.error ? <p role="alert" className="mt-2 text-sm text-red-700">{(action.error as Error).message}</p> : null}
        <Button className="mt-3 w-full" disabled={cart.length === 0 || action.busy} onClick={place}>Place order</Button>
        <p className="mt-2 text-xs text-stone-400"><Badge tone="gray">{source === 'POS' ? 'counter' : 'waiter'}</Badge> GST is added on the bill.</p>
      </div>
    </div>
  );
}
