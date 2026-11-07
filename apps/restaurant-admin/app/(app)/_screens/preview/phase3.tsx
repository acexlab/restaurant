'use client';

import { Badge, Button, Card, Field, Input, PageHeader, Select, Table, Td } from '@xeva/ui';
import { useState, type FormEvent } from 'react';
import { Bars, DAYS, HOURLY, INGREDIENTS, PreviewBanner, rs, STAFF, Stat, SUPPLIERS } from './kit';

// ───────────── Staff & attendance (spec 9.12) ─────────────
export function Staff() {
  const [staff, setStaff] = useState(STAFF);
  const checkIn = (id: string) => setStaff((s) => s.map((x) => (x.id === id ? { ...x, in: new Date().toTimeString().slice(0, 5), status: 'On duty' } : x)));
  const week = [
    ['Rajesh K', 'M', 'M', 'M', 'M', 'M', 'off', 'M'],
    ['Fathima N', 'E', 'E', 'off', 'E', 'E', 'E', 'E'],
    ['Arun Das', 'E', 'E', 'E', 'off', 'E', 'E', 'E'],
    ['Bincy Thomas', 'off', 'E', 'E', 'E', 'E', 'E', 'E'],
  ];
  return (
    <>
      <PageHeader title="Staff" description="Who is on duty, the week's shifts and leave requests." />
      <PreviewBanner phase={3} />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="On duty" value={staff.filter((s) => s.status === 'On duty').length} />
        <Stat label="Late" value={staff.filter((s) => s.status === 'Late').length} tone="bad" />
        <Stat label="On leave" value={staff.filter((s) => s.status === 'On leave').length} />
        <Stat label="Hours this week" value="312" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Today">
          <Table head={['Name', 'Role', 'Shift', 'In', '']}>
            {staff.map((s) => (
              <tr key={s.id}>
                <Td className="font-medium text-stone-900">{s.name}</Td><Td>{s.role}</Td><Td className="tabular-nums">{s.shift}</Td>
                <Td><span className="tabular-nums">{s.in}</span> <Badge tone={s.status === 'On duty' ? 'green' : s.status === 'Late' ? 'red' : 'gray'}>{s.status}</Badge></Td>
                <Td>{s.status === 'Late' && <Button variant="ghost" onClick={() => checkIn(s.id)}>Check in</Button>}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="This week's rota" actions={<span className="text-xs text-stone-500">M = 10–18 · E = 12–22</span>}>
          <Table head={['', ...DAYS]}>
            {week.map(([name, ...days]) => (
              <tr key={name}><Td className="font-medium">{name}</Td>{days.map((d, i) => <Td key={i} className={d === 'off' ? 'text-stone-400' : 'font-medium'}>{d}</Td>)}</tr>
            ))}
          </Table>
        </Card>
        <Card title="Leave requests">
          <ul className="divide-y divide-stone-100 text-sm">
            {[['Suresh P', '7–9 Nov', 'Family function'], ['Bincy Thomas', '15 Nov', 'Medical']].map(([n, d, r]) => (
              <li key={n} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><b>{n}</b> · {d} · {r}</span>
                <span className="flex gap-1"><Button variant="secondary">Approve</Button><Button variant="ghost">Decline</Button></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

// ───────────── Inventory (spec 9.11) ─────────────
export function Inventory() {
  const [items, setItems] = useState(INGREDIENTS);
  const [adj, setAdj] = useState({ id: INGREDIENTS[0].id, qty: '', reason: 'Wastage' });
  const apply = (e: FormEvent) => {
    e.preventDefault();
    const q = Number(adj.qty) * (adj.reason === 'Received' ? 1 : -1);
    setItems((xs) => xs.map((x) => (x.id === adj.id ? { ...x, stock: Math.max(0, +(x.stock + q).toFixed(2)) } : x)));
    setAdj({ ...adj, qty: '' });
  };
  const low = items.filter((i) => i.stock < i.par);
  return (
    <>
      <PageHeader title="Inventory" description="Stock is deducted by recipe when an order is paid. Low stock raises an alert and a purchase suggestion." />
      <PreviewBanner phase={3} />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Stat label="Stock value" value={rs(items.reduce((s, i) => s + i.stock * i.cost, 0))} />
        <Stat label="Below par level" value={low.length} tone={low.length ? 'bad' : 'good'} />
        <Stat label="Wastage this week" value={rs(1840)} sub="2.1% of food cost" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card title="Stock">
          <Table head={['Ingredient', 'In stock', 'Par', 'Cost/unit', 'Expiry']}>
            {items.map((i) => (
              <tr key={i.id}>
                <Td className="font-medium text-stone-900">{i.name}</Td>
                <Td><span className={i.stock < i.par ? 'font-semibold text-red-700' : ''}>{i.stock} {i.unit}</span></Td>
                <Td>{i.par} {i.unit}</Td><Td>{rs(i.cost)}</Td>
                <Td>{i.expiry === 'Tomorrow' || i.expiry === '2 days' ? <Badge tone="amber">{i.expiry}</Badge> : i.expiry}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <div className="space-y-4">
          <Card title="Adjust stock">
            <form onSubmit={apply} className="space-y-3">
              <Field label="Ingredient"><Select value={adj.id} onChange={(e) => setAdj({ ...adj, id: e.target.value })}>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantity"><Input required type="number" min={0.01} step="0.01" value={adj.qty} onChange={(e) => setAdj({ ...adj, qty: e.target.value })} /></Field>
                <Field label="Reason"><Select value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })}><option>Wastage</option><option>Received</option><option>Staff meal</option><option>Count correction</option></Select></Field>
              </div>
              <Button type="submit" className="w-full">Record</Button>
            </form>
          </Card>
          <Card title="Recipe: Malabar Chicken Biryani (Full)">
            <ul className="space-y-1 text-sm">{[['Basmati rice', '0.25 kg'], ['Chicken', '0.30 kg'], ['Shallots', '0.05 kg'], ['Coconut oil', '0.03 L']].map(([a, b]) => <li key={a} className="flex justify-between"><span>{a}</span><span className="tabular-nums">{b}</span></li>)}</ul>
            <p className="mt-2 text-xs text-stone-500">Food cost ₹ 96 · menu price ₹ 260 · margin 63%</p>
          </Card>
        </div>
      </div>
    </>
  );
}

// ───────────── Procurement (spec 9.11) ─────────────
export function Procurement() {
  const [pos, setPos] = useState([
    { id: 'PO-0042', supplier: 'Kozhikode Meat Traders', items: 'Chicken 20 kg, Beef 10 kg', total: 8600, status: 'SENT' },
    { id: 'PO-0041', supplier: 'Malabar Rice Mills', items: 'Basmati 50 kg', total: 6000, status: 'RECEIVED' },
  ]);
  return (
    <>
      <PageHeader title="Procurement" description="Suppliers, purchase orders and goods received. Receiving a PO adds the stock automatically." />
      <PreviewBanner phase={3} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Purchase orders" actions={<Button onClick={() => setPos((p) => [{ id: `PO-00${43 + p.length - 2}`, supplier: 'Green Valley Vegetables', items: 'Shallots 10 kg (suggested: below par)', total: 900, status: 'DRAFT' }, ...p])}>Suggest from low stock</Button>}>
          <Table head={['PO', 'Supplier', 'Items', 'Total', 'Status', '']}>
            {pos.map((p) => (
              <tr key={p.id}>
                <Td className="font-mono text-xs">{p.id}</Td><Td>{p.supplier}</Td><Td className="text-xs">{p.items}</Td><Td>{rs(p.total)}</Td><Td><Badge>{p.status}</Badge></Td>
                <Td>
                  {p.status === 'DRAFT' && <Button variant="ghost" onClick={() => setPos((x) => x.map((y) => (y.id === p.id ? { ...y, status: 'SENT' } : y)))}>Send</Button>}
                  {p.status === 'SENT' && <Button variant="ghost" onClick={() => setPos((x) => x.map((y) => (y.id === p.id ? { ...y, status: 'RECEIVED' } : y)))}>Receive</Button>}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Suppliers">
          <Table head={['Supplier', 'Supplies', 'Phone', 'GSTIN']}>
            {SUPPLIERS.map((s) => <tr key={s.id}><Td className="font-medium">{s.name}</Td><Td>{s.items}</Td><Td>{s.phone}</Td><Td className="font-mono text-xs">{s.gstin}</Td></tr>)}
          </Table>
        </Card>
      </div>
    </>
  );
}

// ───────────── Expenses (spec 9.13) ─────────────
export function Expenses() {
  const [rows, setRows] = useState([
    { id: 'e1', date: '1 Nov', category: 'Rent', note: 'November rent', amount: 85000 },
    { id: 'e2', date: '3 Nov', category: 'Utilities', note: 'KSEB electricity', amount: 18400 },
    { id: 'e3', date: '5 Nov', category: 'Gas', note: 'Commercial LPG x6', amount: 11700 },
    { id: 'e4', date: '6 Nov', category: 'Repairs', note: 'Fridge compressor', amount: 6500 },
  ]);
  const [f, setF] = useState({ category: 'Utilities', note: '', amount: '' });
  return (
    <>
      <PageHeader title="Expenses" description="Day-to-day costs, so profit reports are real. Supplier bills come from Procurement automatically." />
      <PreviewBanner phase={3} />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card title={`November · ${rs(rows.reduce((s, r) => s + r.amount, 0))}`}>
          <Table head={['Date', 'Category', 'Note', 'Amount']}>
            {rows.map((r) => <tr key={r.id}><Td>{r.date}</Td><Td>{r.category}</Td><Td>{r.note}</Td><Td className="tabular-nums">{rs(r.amount)}</Td></tr>)}
          </Table>
        </Card>
        <Card title="Add expense">
          <form onSubmit={(e) => { e.preventDefault(); setRows((r) => [...r, { id: crypto.randomUUID(), date: 'Today', ...f, amount: Number(f.amount) }]); setF({ ...f, note: '', amount: '' }); }} className="space-y-3">
            <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['Rent', 'Utilities', 'Gas', 'Repairs', 'Salaries', 'Marketing', 'Other'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Note"><Input required value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
            <Field label="Amount ₹"><Input required type="number" min={1} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Button type="submit" className="w-full">Add</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

// ───────────── Finance (spec 9.13) ─────────────
export function Finance() {
  const pnl: [string, number][] = [['Sales (net of GST)', 912400], ['Food cost', -318300], ['Salaries', -186000], ['Rent', -85000], ['Utilities & gas', -30100], ['Other expenses', -21600]];
  const profit = pnl.reduce((s, [, v]) => s + v, 0);
  return (
    <>
      <PageHeader title="Finance" description="Profit and loss from POS sales, recipe food cost, staff and expenses." />
      <PreviewBanner phase={3} />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Sales (Oct)" value={rs(912400)} />
        <Stat label="Food cost" value="34.9%" sub="target under 35%" tone="good" />
        <Stat label="Net profit" value={rs(profit)} tone="good" />
        <Stat label="GST payable" value={rs(45620)} sub="GSTR-3B due 20 Nov" />
      </div>
      <Card title="Profit & loss · October">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-stone-100">{pnl.map(([k, v]) => <tr key={k}><td className="py-2">{k}</td><td className={`py-2 text-right tabular-nums ${v < 0 ? 'text-stone-600' : ''}`}>{v < 0 ? `−${rs(-v)}` : rs(v)}</td></tr>)}</tbody>
          <tfoot><tr className="font-semibold"><td className="pt-3">Net profit</td><td className="pt-3 text-right tabular-nums text-emerald-700">{rs(profit)}</td></tr></tfoot>
        </table>
      </Card>
    </>
  );
}

// ───────────── Analytics (spec 9.13) ─────────────
export function Analytics() {
  const daily = DAYS.map((d, i) => ({ label: d, value: [24100, 21800, 26900, 25400, 38700, 52300, 47600][i] }));
  const best = [['Malabar Chicken Biryani', 412, 107120], ['Malabar Parotta', 1180, 29500], ['Beef Ularthiyathu', 236, 56640], ['Sulaimani', 690, 20700], ['Kozhi Porichathu', 188, 41360]] as const;
  return (
    <>
      <PageHeader title="Analytics" description="What sells, when you're busy and how this week compares." />
      <PreviewBanner phase={3} />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Sales this week" value={rs(236800)} sub="+12% vs last week" tone="good" />
        <Stat label="Orders" value="1,064" />
        <Stat label="Average bill" value={rs(223)} />
        <Stat label="QR orders" value="41%" sub="of dine-in" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Sales by day"><Bars label="Sales by day of week" data={daily} format={rs} /></Card>
        <Card title="Orders by hour (busy times)"><Bars label="Orders by hour" data={HOURLY} /></Card>
        <Card title="Best sellers this week" className="lg:col-span-2">
          <Table head={['Dish', 'Sold', 'Revenue']}>
            {best.map(([n, q, r]) => <tr key={n}><Td className="font-medium">{n}</Td><Td className="tabular-nums">{q}</Td><Td className="tabular-nums">{rs(r)}</Td></tr>)}
          </Table>
        </Card>
      </div>
    </>
  );
}
