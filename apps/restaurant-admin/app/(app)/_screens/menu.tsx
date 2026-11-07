'use client';

import { Badge, Button, Card, ErrorBanner, Field, formatPaise, Input, Loading, PageHeader, Select, Toggle, useAction, useLoad } from '@xeva/ui';
import { useState, type FormEvent } from 'react';
import { useTenant } from '../tenant';
import { type MenuCategory, type MenuItem, rupees } from '../shared';

const GST = [
  { bps: 500, label: '5% (restaurant service)' },
  { bps: 0, label: '0% (exempt)' },
  { bps: 1200, label: '12%' },
  { bps: 1800, label: '18%' },
];
const emptyItem = { id: '', categoryId: '', name: '', nameMl: '', description: '', price: '', taxRateBps: 500, isVeg: true, variants: '', addons: '' };

/** "Half: 180, Full: 250" ⇄ [{ name, pricePaise }] */
const parseOptions = (s: string) =>
  s.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [name, price] = p.split(':').map((x) => x.trim());
    return { name, pricePaise: rupees(price ?? '0') };
  });
const formatOptions = (o: { name: string; pricePaise: number }[]) => o.map((x) => `${x.name}: ${x.pricePaise / 100}`).join(', ');

export default function MenuScreen() {
  const { call } = useTenant();
  const action = useAction();
  const menu = useLoad(() => call<MenuCategory[]>('/menu'), []);
  const [cat, setCat] = useState({ name: '', nameMl: '' });
  const [item, setItem] = useState(emptyItem);

  const run = async (fn: () => Promise<unknown>) => {
    await action.run(fn);
    menu.reload();
  };
  const addCategory = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await call('/menu/categories', { method: 'POST', body: { name: cat.name, nameMl: cat.nameMl || undefined } });
      setCat({ name: '', nameMl: '' });
    });
  };
  const saveItem = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const body = {
        categoryId: item.categoryId || menu.data?.[0]?.id,
        name: item.name,
        nameMl: item.nameMl || undefined,
        description: item.description || undefined,
        pricePaise: rupees(item.price),
        taxRateBps: item.taxRateBps,
        isVeg: item.isVeg,
        variants: parseOptions(item.variants),
        addons: parseOptions(item.addons),
      };
      await call(item.id ? `/menu/items/${item.id}` : '/menu/items', { method: item.id ? 'PATCH' : 'POST', body });
      setItem({ ...emptyItem, categoryId: body.categoryId ?? '' });
    });
  };
  const edit = (i: MenuItem) =>
    setItem({ id: i.id, categoryId: i.categoryId, name: i.name, nameMl: i.nameMl ?? '', description: i.description ?? '', price: String(i.pricePaise / 100), taxRateBps: i.taxRateBps, isVeg: i.isVeg, variants: formatOptions(i.variants), addons: formatOptions(i.addons) });

  if (!menu.data) return menu.error ? <ErrorBanner error={menu.error} /> : <Loading />;

  return (
    <>
      <PageHeader title="Menu Management" description="Prices are before GST. Changes apply to new orders only; placed orders keep their prices." />
      <ErrorBanner error={action.error} />
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-4">
          {menu.data.length === 0 && <Card><p className="text-sm text-stone-500">Start by adding a category, for example “Starters” or “Biryani”.</p></Card>}
          {menu.data.map((c) => (
            <Card
              key={c.id}
              title={<span className="flex items-center gap-2">{c.name}{c.nameMl && <span className="font-normal text-stone-500">{c.nameMl}</span>}{!c.isActive && <Badge tone="gray">hidden</Badge>}</span>}
              actions={<Toggle label={`Show ${c.name}`} checked={c.isActive} disabled={action.busy} onChange={(v) => run(() => call(`/menu/categories/${c.id}`, { method: 'PATCH', body: { isActive: v } }))} />}
            >
              {c.items.length === 0 ? <p className="text-sm text-stone-500">No items yet.</p> : (
                <ul className="divide-y divide-stone-100">
                  {c.items.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="font-medium text-stone-900">
                          <span aria-label={i.isVeg ? 'Vegetarian' : 'Non-vegetarian'} className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${i.isVeg ? 'bg-emerald-600' : 'bg-red-700'}`} />
                          {i.name} <span className="font-normal text-stone-500">{formatPaise(i.pricePaise)} · GST {i.taxRateBps / 100}%</span>
                        </p>
                        {(i.variants.length > 0 || i.addons.length > 0) && (
                          <p className="text-xs text-stone-500">{[formatOptions(i.variants), i.addons.length ? `Add-ons: ${formatOptions(i.addons)}` : ''].filter(Boolean).join(' · ')}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-stone-500">{i.isAvailable ? 'Available' : 'Sold out'}</span>
                        <Toggle label={`${i.name} available`} checked={i.isAvailable} disabled={action.busy} onChange={(v) => run(() => call(`/menu/items/${i.id}`, { method: 'PATCH', body: { isAvailable: v } }))} />
                        <Button variant="ghost" onClick={() => edit(i)}>Edit</Button>
                        <Button variant="ghost" disabled={action.busy} onClick={() => confirm(`Remove ${i.name} from the menu?`) && run(() => call(`/menu/items/${i.id}`, { method: 'DELETE' }))}>Remove</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card title="Add category">
            <form onSubmit={addCategory} className="space-y-3">
              <Field label="Name"><Input required maxLength={60} value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} /></Field>
              <Field label="Name in Malayalam (optional)"><Input maxLength={60} lang="ml" value={cat.nameMl} onChange={(e) => setCat({ ...cat, nameMl: e.target.value })} /></Field>
              <Button type="submit" disabled={action.busy}>Add category</Button>
            </form>
          </Card>

          {menu.data.length > 0 && (
            <Card title={item.id ? 'Edit item' : 'Add item'}>
              <form onSubmit={saveItem} className="space-y-3">
                <Field label="Category">
                  <Select value={item.categoryId || menu.data[0].id} onChange={(e) => setItem({ ...item, categoryId: e.target.value })}>
                    {menu.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Name"><Input required maxLength={80} value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} /></Field>
                <Field label="Name in Malayalam (optional)"><Input maxLength={80} lang="ml" value={item.nameMl} onChange={(e) => setItem({ ...item, nameMl: e.target.value })} /></Field>
                <Field label="Description (optional)"><Input maxLength={300} value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Price ₹ (before GST)"><Input required type="number" min={0} step="0.01" value={item.price} onChange={(e) => setItem({ ...item, price: e.target.value })} /></Field>
                  <Field label="GST">
                    <Select value={item.taxRateBps} onChange={(e) => setItem({ ...item, taxRateBps: Number(e.target.value) })}>
                      {GST.map((g) => <option key={g.bps} value={g.bps}>{g.label}</option>)}
                    </Select>
                  </Field>
                </div>
                <label className="flex items-center justify-between text-sm">Vegetarian <Toggle label="Vegetarian" checked={item.isVeg} onChange={(v) => setItem({ ...item, isVeg: v })} /></label>
                <Field label="Options (optional)" hint="Replaces the price, e.g. Half: 180, Full: 250"><Input value={item.variants} onChange={(e) => setItem({ ...item, variants: e.target.value })} /></Field>
                <Field label="Add-ons (optional)" hint="Charged extra, e.g. Extra raita: 30"><Input value={item.addons} onChange={(e) => setItem({ ...item, addons: e.target.value })} /></Field>
                <div className="flex gap-2">
                  <Button type="submit" disabled={action.busy}>{item.id ? 'Save' : 'Add item'}</Button>
                  {item.id && <Button type="button" variant="ghost" onClick={() => setItem(emptyItem)}>Cancel</Button>}
                </div>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
