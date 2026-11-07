'use client';

import { Badge, Button, Card, ErrorBanner, Field, Input, Loading, PageHeader, Select, Toggle, useAction, useLoad } from '@xeva/ui';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { useTenant } from '../tenant';
import { CUSTOMER_URL, type Table } from '../shared';

interface Employee { id: string; displayName: string; status: string; roles: { key: string }[] }

function Qr({ url, label }: { url: string; label: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 1, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => setSrc(''));
  }, [url]);
  return src ? <img src={src} alt={`QR code for ${label}`} className="h-36 w-36" /> : <div className="h-36 w-36 bg-stone-100" />;
}

export default function TablesScreen() {
  const { tenant, call, can } = useTenant();
  const action = useAction();
  const data = useLoad(async () => {
    const [tables, employees] = await Promise.all([call<Table[]>('/tables'), can('team') ? call<Employee[]>(`/tenants/${tenant.id}/employees`) : Promise.resolve([] as Employee[])]);
    return { tables, waiters: employees.filter((e) => e.status === 'ACTIVE') };
  }, [tenant.id]);
  const [form, setForm] = useState({ code: '', seats: '4' });

  const run = async (fn: () => Promise<unknown>) => {
    await action.run(fn);
    data.reload();
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await call('/tables', { method: 'POST', body: { code: form.code.trim().toUpperCase(), seats: Number(form.seats) } });
      setForm({ code: '', seats: form.seats });
    });
  };
  const tableUrl = (t: Table) => `${CUSTOMER_URL}/${tenant.slug}/t/${t.qrToken}`;

  if (!data.data) return data.error ? <ErrorBanner error={data.error} /> : <Loading />;

  return (
    <>
      <PageHeader
        title="Tables & QR"
        description="Each table gets its own QR code. Guests scan it to see the menu, order and call a waiter."
        actions={data.data.tables.length > 0 && <Button variant="secondary" onClick={() => window.print()}>Print QR codes</Button>}
      />
      <ErrorBanner error={action.error} />
      <Card title="Add a table" className="mb-4 print:hidden">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[10rem_8rem_auto] sm:items-end">
          <Field label="Table number"><Input required maxLength={12} placeholder="T1" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
          <Field label="Seats"><Input required type="number" min={1} max={40} value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} /></Field>
          <Button type="submit" disabled={action.busy}>Add</Button>
        </form>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.data.tables.map((t) => (
          <Card key={t.id} className="break-inside-avoid">
            <div className="flex items-start gap-4">
              <Qr url={tableUrl(t)} label={`table ${t.code}`} />
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <p className="text-2xl font-semibold">{t.code}</p>
                <p className="text-stone-500">{t.seats} seats {!t.isActive && <Badge tone="gray">off</Badge>}</p>
                <a href={tableUrl(t)} target="_blank" rel="noreferrer" className="block truncate text-xs text-[var(--brand)] hover:underline print:hidden">Open guest view</a>
              </div>
            </div>
            <div className="mt-3 space-y-2 border-t border-stone-100 pt-3 text-sm print:hidden">
              {data.data!.waiters.length > 0 && (
                <Field label="Waiter">
                  <Select value={t.assignedEmployeeId ?? ''} disabled={action.busy} onChange={(e) => run(() => call(`/tables/${t.id}`, { method: 'PATCH', body: { assignedEmployeeId: e.target.value || null } }))}>
                    <option value="">Unassigned</option>
                    {data.data!.waiters.map((w) => <option key={w.id} value={w.id}>{w.displayName}</option>)}
                  </Select>
                </Field>
              )}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2">In use <Toggle label={`Table ${t.code} in use`} checked={t.isActive} disabled={action.busy} onChange={(v) => run(() => call(`/tables/${t.id}`, { method: 'PATCH', body: { isActive: v } }))} /></label>
                <Button variant="ghost" disabled={action.busy} onClick={() => confirm(`Make a new QR for ${t.code}? The old sticker stops working.`) && run(() => call(`/tables/${t.id}/rotate-qr`, { method: 'POST' }))}>New QR</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
