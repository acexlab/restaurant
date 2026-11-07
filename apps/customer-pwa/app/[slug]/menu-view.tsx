'use client';

import { Button, ErrorBanner, formatPaise, Input, useAction, useLoad } from '@xeva/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { publicApi, useRestaurant } from './restaurant';

interface Option { id: string; name: string; pricePaise: number }
interface Item { id: string; name: string; nameMl: string | null; description: string | null; pricePaise: number; isVeg: boolean; isAvailable: boolean; variants: Option[]; addons: Option[] }
interface Category { id: string; name: string; nameMl: string | null; items: Item[] }
interface TableInfo { tableCode: string; canOrder: boolean; canCallWaiter: boolean }
interface Line { key: string; item: Item; variant?: Option; addons: Option[]; quantity: number }

const unit = (l: Line) => (l.variant?.pricePaise ?? l.item.pricePaise) + l.addons.reduce((s, a) => s + a.pricePaise, 0);
const priceFrom = (i: Item) => (i.variants.length ? Math.min(...i.variants.map((v) => v.pricePaise)) : i.pricePaise);

function VegMark({ veg }: { veg: boolean }) {
  return (
    <span role="img" aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'} className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${veg ? 'border-emerald-700' : 'border-red-800'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${veg ? 'bg-emerald-700' : 'bg-red-800'}`} />
    </span>
  );
}

/** Menu for guests. With a table QR token it also takes orders and service requests. */
export function MenuView({ slug, qrToken }: { slug: string; qrToken?: string }) {
  const router = useRouter();
  const { restaurant, style } = useRestaurant(slug);
  const data = useLoad(async () => {
    const [menu, table] = await Promise.all([
      publicApi<Category[]>(slug, '/menu'),
      qrToken ? publicApi<TableInfo>(slug, `/tables/${encodeURIComponent(qrToken)}`) : Promise.resolve(null),
    ]);
    return { menu: menu.filter((c) => c.items.length), table };
  }, [slug, qrToken]);
  const action = useAction();
  const [cart, setCart] = useState<Line[]>([]);
  const [picking, setPicking] = useState<{ item: Item; variant?: Option; addons: Option[] } | null>(null);
  const [review, setReview] = useState(false);
  const [notes, setNotes] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [toast, setToast] = useState<string | null>(null);

  const canOrder = !!data.data?.table?.canOrder;
  const count = cart.reduce((s, l) => s + l.quantity, 0);
  const total = useMemo(() => cart.reduce((s, l) => s + unit(l) * l.quantity, 0), [cart]);

  const add = (item: Item, variant?: Option, addons: Option[] = []) => {
    const k = [item.id, variant?.id, ...addons.map((a) => a.id).sort()].join('|');
    setCart((c) => (c.some((l) => l.key === k) ? c.map((l) => (l.key === k ? { ...l, quantity: l.quantity + 1 } : l)) : [...c, { key: k, item, variant, addons, quantity: 1 }]));
    setPicking(null);
  };
  const qty = (k: string, d: number) => setCart((c) => c.map((l) => (l.key === k ? { ...l, quantity: l.quantity + d } : l)).filter((l) => l.quantity > 0));

  const place = () =>
    action.run(async () => {
      const { orderId } = await publicApi<{ orderId: string }>(slug, '/orders', {
        method: 'POST',
        body: {
          qrToken,
          idempotencyKey: key,
          notes: notes.trim() || undefined,
          lines: cart.map((l) => ({ menuItemId: l.item.id, variantId: l.variant?.id, addonIds: l.addons.map((a) => a.id), quantity: l.quantity })),
        },
      });
      setCart([]);
      setKey(crypto.randomUUID());
      router.push(`/${slug}/order/${orderId}`);
    });
  const ask = (type: 'WAITER' | 'BILL' | 'WATER', text: string) =>
    action.run(async () => {
      await publicApi(slug, `/tables/${encodeURIComponent(qrToken!)}/requests`, { method: 'POST', body: { type } });
      setToast(text);
      setTimeout(() => setToast(null), 4000);
    });

  if (data.error) return <main className="p-6 text-center text-stone-600">This menu is not available.</main>;

  return (
    <main style={style} className="mx-auto min-h-screen max-w-md pb-28">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold text-stone-900">{restaurant?.name ?? ' '}</h1>
        <p className="text-sm text-stone-500">{data.data?.table ? `Table ${data.data.table.tableCode}` : 'Menu'}{data.data?.table && !canOrder ? ' · please order with our staff' : ''}</p>
        {data.data?.menu && data.data.menu.length > 1 && (
          <nav aria-label="Categories" className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
            {data.data.menu.map((c) => (
              <a key={c.id} href={`#c-${c.id}`} className="shrink-0 rounded-full border border-stone-300 px-3 py-1 text-sm text-stone-700">{c.name}</a>
            ))}
          </nav>
        )}
      </header>

      {toast && <p role="status" className="mx-4 mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{toast}</p>}
      <div className="px-4"><ErrorBanner error={action.error} /></div>

      {!data.data ? <p className="p-6 text-center text-stone-500">Loading menu…</p> : data.data.menu.map((c) => (
        <section key={c.id} id={`c-${c.id}`} className="scroll-mt-28 px-4 pt-5">
          <h2 className="text-base font-semibold text-stone-900">{c.name}{c.nameMl && <span lang="ml" className="ml-2 font-normal text-stone-500">{c.nameMl}</span>}</h2>
          <ul className="mt-2 divide-y divide-stone-100">
            {c.items.map((i) => (
              <li key={i.id} className={`flex gap-3 py-3 ${i.isAvailable ? '' : 'opacity-50'}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium text-stone-900"><VegMark veg={i.isVeg} />{i.name}</p>
                  {i.nameMl && <p lang="ml" className="text-sm text-stone-500">{i.nameMl}</p>}
                  {i.description && <p className="mt-0.5 text-sm text-stone-500">{i.description}</p>}
                  <p className="mt-1 text-sm tabular-nums text-stone-800">{i.variants.length ? 'from ' : ''}{formatPaise(priceFrom(i))}</p>
                </div>
                {canOrder && (
                  i.isAvailable ? (
                    <Button variant="secondary" className="min-h-10 self-center" aria-label={`Add ${i.name}`} onClick={() => (i.variants.length || i.addons.length ? setPicking({ item: i, variant: i.variants[0], addons: [] }) : add(i))}>Add</Button>
                  ) : <span className="self-center text-xs text-stone-500">Sold out</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {qrToken && data.data?.table?.canCallWaiter && (
        <div className="mx-4 mt-6 flex gap-2">
          <Button variant="secondary" className="min-h-11 flex-1" disabled={action.busy} onClick={() => ask('WAITER', 'A waiter is on the way.')}>Call waiter</Button>
          <Button variant="secondary" className="min-h-11 flex-1" disabled={action.busy} onClick={() => ask('BILL', 'We’ll bring your bill.')}>Ask for bill</Button>
        </div>
      )}

      {picking && (
        <div role="dialog" aria-modal="true" aria-label={picking.item.name} className="fixed inset-0 z-20 flex items-end bg-black/40" onClick={() => setPicking(null)}>
          <div className="mx-auto w-full max-w-md rounded-t-2xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-semibold">{picking.item.name}</p>
            {picking.item.variants.length > 0 && (
              <fieldset className="mt-3 space-y-2">
                <legend className="text-sm text-stone-500">Choose one</legend>
                {picking.item.variants.map((v) => (
                  <label key={v.id} className="flex min-h-11 items-center justify-between rounded-md border border-stone-200 px-3">
                    <span><input type="radio" name="variant" className="mr-2" checked={picking.variant?.id === v.id} onChange={() => setPicking({ ...picking, variant: v })} />{v.name}</span>
                    <span className="tabular-nums">{formatPaise(v.pricePaise)}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {picking.item.addons.length > 0 && (
              <fieldset className="mt-3 space-y-2">
                <legend className="text-sm text-stone-500">Add extra</legend>
                {picking.item.addons.map((a) => (
                  <label key={a.id} className="flex min-h-11 items-center justify-between rounded-md border border-stone-200 px-3">
                    <span>
                      <input type="checkbox" className="mr-2" checked={picking.addons.some((x) => x.id === a.id)}
                        onChange={(e) => setPicking({ ...picking, addons: e.target.checked ? [...picking.addons, a] : picking.addons.filter((x) => x.id !== a.id) })} />
                      {a.name}
                    </span>
                    <span className="tabular-nums">+{formatPaise(a.pricePaise)}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <Button className="mt-4 min-h-12 w-full text-base" onClick={() => add(picking.item, picking.variant, picking.addons)}>Add to order</Button>
          </div>
        </div>
      )}

      {review && (
        <div role="dialog" aria-modal="true" aria-label="Your order" className="fixed inset-0 z-20 flex items-end bg-black/40" onClick={() => setReview(false)}>
          <div className="mx-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-semibold">Your order</p>
            <ul className="mt-3 divide-y divide-stone-100">
              {cart.map((l) => (
                <li key={l.key} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{l.item.name}{l.variant ? ` (${l.variant.name})` : ''}</p>
                    {l.addons.length > 0 && <p className="text-stone-500">+ {l.addons.map((a) => a.name).join(', ')}</p>}
                    <p className="tabular-nums text-stone-600">{formatPaise(unit(l) * l.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="secondary" className="min-h-10 min-w-10" aria-label={`One less ${l.item.name}`} onClick={() => qty(l.key, -1)}>−</Button>
                    <span className="w-6 text-center tabular-nums">{l.quantity}</span>
                    <Button variant="secondary" className="min-h-10 min-w-10" aria-label={`One more ${l.item.name}`} onClick={() => qty(l.key, 1)}>+</Button>
                  </div>
                </li>
              ))}
            </ul>
            <label className="mt-3 block text-sm">
              <span className="text-stone-600">Anything the kitchen should know?</span>
              <Input className="mt-1" maxLength={300} placeholder="Less spicy, no onion…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <p className="mt-3 flex justify-between text-sm"><span>Items</span><span className="tabular-nums">{formatPaise(total)}</span></p>
            <p className="text-xs text-stone-500">GST is added on your bill.</p>
            <Button className="mt-4 min-h-12 w-full text-base" disabled={action.busy || cart.length === 0} onClick={place}>{action.busy ? 'Sending…' : 'Send order to kitchen'}</Button>
          </div>
        </div>
      )}

      {count > 0 && !review && (
        <div className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <Button className="min-h-12 w-full justify-between px-5 text-base shadow-lg" onClick={() => setReview(true)}>
            <span>{count} item{count > 1 ? 's' : ''}</span><span>View order · {formatPaise(total)}</span>
          </Button>
        </div>
      )}
    </main>
  );
}
