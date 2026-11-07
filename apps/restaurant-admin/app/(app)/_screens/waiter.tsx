'use client';

import { Badge, Button, Card, Empty, ErrorBanner, Loading, PageHeader, useAction, useLoad } from '@xeva/ui';
import { useState } from 'react';
import { useTenant } from '../tenant';
import { itemLine, minutesSince, type Order, OrderComposer, type Table, usePolling } from '../shared';

interface Board {
  tables: (Table & { mine: boolean; openOrders: number })[];
  ready: (Order & { mine: boolean })[];
  requests: { id: string; tableCode: string; type: 'WAITER' | 'BILL' | 'WATER'; createdAt: string; mine: boolean }[];
}
const REQUEST = { WAITER: 'needs a waiter', BILL: 'wants the bill', WATER: 'wants water' };

/** Waiter screen (spec 9.6, 13): mobile-first. Mine first, then everyone's. */
export default function WaiterScreen() {
  const { call } = useTenant();
  const action = useAction();
  const board = useLoad(() => call<Board>('/waiter/board'), []);
  const [taking, setTaking] = useState(false);
  usePolling(board.reload, 5000);

  const run = async (fn: () => Promise<unknown>) => {
    await action.run(fn);
    board.reload();
  };
  const mineFirst = <T extends { mine: boolean }>(xs: T[]) => [...xs].sort((a, b) => Number(b.mine) - Number(a.mine));

  if (!board.data) return board.error ? <ErrorBanner error={board.error} /> : <Loading />;
  const { tables, ready, requests } = board.data;

  return (
    <>
      <PageHeader title="Waiter" description="Ready dishes and table requests. Your tables are listed first." actions={<Button onClick={() => setTaking(!taking)}>{taking ? 'Close' : 'Take an order'}</Button>} />
      <ErrorBanner error={action.error} />
      {taking && (
        <Card title="New order" className="mb-4">
          <OrderComposer source="WAITER" call={call} onPlaced={() => (setTaking(false), board.reload())} />
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Table requests (${requests.length})`}>
          {requests.length === 0 ? <Empty>No one is waiting for you.</Empty> : (
            <ul className="divide-y divide-stone-100">
              {mineFirst(requests).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="text-lg font-semibold">Table {r.tableCode}</span> {REQUEST[r.type]}
                    <span className="ml-2 text-xs text-stone-500">{minutesSince(r.createdAt)} min</span> {r.mine && <Badge tone="blue">yours</Badge>}
                  </span>
                  <Button className="min-h-11" disabled={action.busy} onClick={() => run(() => call(`/waiter/requests/${r.id}/resolve`, { method: 'POST' }))}>Done</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Ready to serve (${ready.length})`}>
          {ready.length === 0 ? <Empty>Nothing waiting at the pass.</Empty> : (
            <ul className="divide-y divide-stone-100">
              {mineFirst(ready).map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div>
                    <p><span className="text-lg font-semibold">{o.tableCode ? `Table ${o.tableCode}` : o.label}</span> <span className="text-stone-500">{o.label}</span> {o.mine && <Badge tone="blue">yours</Badge>}</p>
                    <p className="text-sm text-stone-600">{o.items.map((i) => `${i.quantity}× ${itemLine(i)}`).join(', ')}</p>
                  </div>
                  <Button className="min-h-11" disabled={action.busy} onClick={() => run(() => call(`/waiter/orders/${o.id}/served`, { method: 'POST' }))}>Served</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title="Tables" className="mt-4">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {mineFirst(tables).map((t) => (
            <li key={t.id} className={`rounded-md border p-2 text-center ${t.openOrders ? 'border-amber-300 bg-amber-50' : 'border-stone-200'}`}>
              <p className="font-semibold">{t.code}</p>
              <p className="text-xs text-stone-500">{t.openOrders ? `${t.openOrders} open` : 'free'}{t.mine ? ' · yours' : ''}</p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
