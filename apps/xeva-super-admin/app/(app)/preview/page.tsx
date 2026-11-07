'use client';

import { Badge, Button, Card, PageHeader, Table, Td } from '@xeva/ui';
import { useState } from 'react';

const rs = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** Phase 4 Super Admin prototypes: Xeva's own billing, support desk, self sign-ups. Sample data only. */
export default function SuperAdminPreviews() {
  const [tab, setTab] = useState<'billing' | 'support' | 'signups'>('billing');
  const [tickets, setTickets] = useState([
    { id: 'XS-1042', restaurant: 'Malabar Spice House', subject: 'Kitchen printer not printing KOTs', priority: 'HIGH', status: 'OPEN', age: '25 min' },
    { id: 'XS-1041', restaurant: 'Cochin Chai Corner', subject: 'Change token prefix to “C”', priority: 'LOW', status: 'OPEN', age: '3 h' },
    { id: 'XS-1038', restaurant: 'Kayal Seafood Kitchen', subject: 'GSTIN on invoice is wrong', priority: 'MEDIUM', status: 'WAITING', age: '1 day' },
  ]);

  return (
    <>
      <PageHeader title="Roadmap previews" description="Phase 4 platform tools still to be built, as clickable prototypes." />
      <div role="note" className="mb-4 rounded-md border border-dashed border-sky-300 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
        <span className="mr-2 rounded-full bg-sky-600 px-2 py-0.5 text-xs font-semibold uppercase text-white">Preview · Phase 4</span>
        Sample data. Nothing here is saved or charged.
      </div>
      <div className="mb-4 flex gap-2">
        {(['billing', 'support', 'signups'] as const).map((t) => (
          <Button key={t} variant={tab === t ? 'primary' : 'secondary'} onClick={() => setTab(t)}>{{ billing: 'Xeva billing', support: 'Support desk', signups: 'Self sign-ups' }[t]}</Button>
        ))}
      </div>

      {tab === 'billing' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            {[['Monthly recurring revenue', rs(186400)], ['Paying restaurants', '61'], ['Trials ending this week', '7'], ['Failed payments', '3']].map(([l, v]) => (
              <div key={l} className="rounded-lg border border-stone-200 bg-white p-4"><p className="text-sm text-stone-500">{l}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p></div>
            ))}
          </div>
          <Card title="Recent invoices">
            <Table head={['Invoice', 'Restaurant', 'Plan', 'Amount', 'Status', '']}>
              {[
                ['XEVA/26-27/0412', 'Malabar Spice House', 'Restaurant Ordering', 3538, 'PAID'],
                ['XEVA/26-27/0411', 'Cochin Chai Corner', 'Digital Token', 1179, 'PAID'],
                ['XEVA/26-27/0410', 'Thalassery Kitchen', 'Restaurant Ordering', 3538, 'PAST_DUE'],
              ].map(([n, r, p, a, s]) => (
                <tr key={n as string}>
                  <Td className="font-mono text-xs">{n}</Td><Td>{r}</Td><Td>{p}</Td><Td>{rs(a as number)}</Td><Td><Badge>{s as string}</Badge></Td>
                  <Td>{s === 'PAST_DUE' && <Button variant="ghost">Send reminder</Button>}</Td>
                </tr>
              ))}
            </Table>
            <p className="mt-3 text-xs text-stone-500">Grace period 7 days, then modules are suspended automatically. Data is never deleted.</p>
          </Card>
        </div>
      )}

      {tab === 'support' && (
        <Card title="Open tickets">
          <Table head={['Ticket', 'Restaurant', 'Subject', 'Priority', 'Age', 'Status', '']}>
            {tickets.map((t) => (
              <tr key={t.id}>
                <Td className="font-mono text-xs">{t.id}</Td><Td>{t.restaurant}</Td><Td className="font-medium">{t.subject}</Td>
                <Td><Badge tone={t.priority === 'HIGH' ? 'red' : t.priority === 'MEDIUM' ? 'amber' : 'gray'}>{t.priority}</Badge></Td>
                <Td>{t.age}</Td><Td><Badge>{t.status}</Badge></Td>
                <Td>{t.status !== 'RESOLVED' && <Button variant="ghost" onClick={() => setTickets((x) => x.map((y) => (y.id === t.id ? { ...y, status: 'RESOLVED' } : y)))}>Resolve</Button>}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 text-xs text-stone-500">Opening a restaurant to investigate still needs a time-limited support grant, visible in its audit log.</p>
        </Card>
      )}

      {tab === 'signups' && (
        <Card title="Restaurants signing up on their own">
          <Table head={['Restaurant', 'City', 'Step', 'Started', '']}>
            {[
              ['Kuttanad Kitchen', 'Alappuzha', 'Menu added', 'Today'],
              ['Hill Top Café', 'Munnar', 'Verified phone', 'Yesterday'],
              ['Fort Bites', 'Fort Kochi', 'Chose plan (trial)', '2 days ago'],
            ].map(([n, c, s, d]) => (
              <tr key={n}><Td className="font-medium">{n}</Td><Td>{c}</Td><Td><Badge tone="blue">{s}</Badge></Td><Td>{d}</Td><Td><Button variant="ghost">Help with set-up</Button></Td></tr>
            ))}
          </Table>
          <p className="mt-3 text-xs text-stone-500">Self sign-up: verify mobile by OTP → restaurant details & GSTIN → first branch → pick products → 14-day trial.</p>
        </Card>
      )}
    </>
  );
}
