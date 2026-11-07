'use client';

import { Badge, Button, Card, Empty, ErrorBanner, formatDateTime, formatPaise, Loading, PageHeader, Select, useAction, useLoad } from '@xeva/ui';
import { useState } from 'react';
import { useTenant } from '../tenant';
import { itemLine, minutesSince, type Order, usePolling } from '../shared';

/** Next staff step for each status (kitchen and waiter usually do these automatically). */
const NEXT: Record<string, { to: string; label: string } | undefined> = {
  PLACED: { to: 'ACCEPTED', label: 'Accept' },
  ACCEPTED: { to: 'PREPARING', label: 'Start preparing' },
  PREPARING: { to: 'READY', label: 'Mark ready' },
  READY: { to: 'SERVED', label: 'Served' },
};

export default function OrdersScreen() {
  const { call } = useTenant();
  const action = useAction();
  const [view, setView] = useState('active');
  const orders = useLoad(() => call<Order[]>(`/orders?view=${view}`), [view]);
  usePolling(orders.reload);

  const run = async (fn: () => Promise<unknown>) => {
    await action.run(fn);
    orders.reload();
  };
  const cancel = (o: Order) => {
    const reason = prompt(`Why is order ${o.label} cancelled?`);
    if (reason && reason.trim().length >= 2) void run(() => call(`/orders/${o.id}/cancel`, { method: 'POST', body: { reason: reason.trim() } }));
  };

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order from QR tables, waiters and the counter. Updates every few seconds."
        actions={
          <Select aria-label="Show" value={view} onChange={(e) => setView(e.target.value)} className="w-40">
            <option value="active">Open orders</option>
            <option value="today">Today</option>
            <option value="all">Recent</option>
          </Select>
        }
      />
      <ErrorBanner error={orders.error ?? action.error} />
      {!orders.data ? <Loading /> : orders.data.length === 0 ? <Card><Empty>No orders here.</Empty></Card> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {orders.data.map((o) => {
            const next = NEXT[o.status];
            return (
              <Card
                key={o.id}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {o.label}
                    <span className="font-normal text-stone-500">{o.tableCode ? `Table ${o.tableCode}` : o.type === 'TAKEAWAY' ? 'Takeaway' : 'Counter'}</span>
                    <Badge>{o.status}</Badge>
                    {o.paymentStatus !== 'UNPAID' && <Badge>{o.paymentStatus}</Badge>}
                  </span>
                }
              >
                <ul className="space-y-1 text-sm">
                  {o.items.map((i) => (
                    <li key={i.id}><span className="font-medium tabular-nums">{i.quantity}×</span> {itemLine(i)}{i.notes && <span className="text-amber-800"> · {i.notes}</span>}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-stone-500">
                  {o.source.toLowerCase()} · {formatPaise(o.totalPaise)} · {view === 'active' ? `${minutesSince(o.createdAt)} min ago` : formatDateTime(o.createdAt)}
                </p>
                {o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                  <div className="mt-3 flex gap-2">
                    {next && <Button disabled={action.busy} onClick={() => run(() => call(`/orders/${o.id}/status`, { method: 'PATCH', body: { status: next.to } }))}>{next.label}</Button>}
                    {o.paymentStatus !== 'PAID' && <Button variant="ghost" disabled={action.busy} onClick={() => cancel(o)}>Cancel</Button>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
