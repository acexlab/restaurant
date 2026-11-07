'use client';

import { Button, ErrorBanner, Loading, PageHeader, useAction, useLoad } from '@xeva/ui';
import { useTenant } from '../tenant';
import { minutesSince, usePolling } from '../shared';

interface TicketItem { name: string; variantName?: string | null; addons?: string[]; quantity: number; notes?: string | null }
interface Ticket { id: string; label: string; tableCode: string | null; orderType: string | null; status: 'NEW' | 'PREPARING' | 'READY'; items: TicketItem[]; createdAt: string }

const COLUMNS = [
  { status: 'NEW', title: 'New', action: { to: 'PREPARING', label: 'Start' } },
  { status: 'PREPARING', title: 'Preparing', action: { to: 'READY', label: 'Ready' } },
  { status: 'READY', title: 'Ready to serve', action: { to: 'SERVED', label: 'Bump' } },
] as const;

/** Kitchen Display (spec 9.5, 13): large, touch-friendly, oldest first, late tickets highlighted. */
export default function KitchenScreen() {
  const { call } = useTenant();
  const action = useAction();
  const tickets = useLoad(() => call<Ticket[]>('/kitchen/tickets'), []);
  usePolling(tickets.reload, 4000);

  const move = async (t: Ticket, to: string) => {
    await action.run(() => call(`/kitchen/tickets/${t.id}`, { method: 'PATCH', body: { status: to } }));
    tickets.reload();
  };

  return (
    <>
      <PageHeader title="Kitchen" description="Tickets arrive automatically from connected ordering. Tap to move them along." />
      <ErrorBanner error={tickets.error ?? action.error} />
      {!tickets.data ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const list = tickets.data!.filter((t) => t.status === col.status);
            return (
              <section key={col.status} aria-label={col.title} className="rounded-lg bg-stone-100 p-3">
                <h2 className="mb-3 flex justify-between text-sm font-semibold uppercase tracking-wide text-stone-600">{col.title}<span className="tabular-nums">{list.length}</span></h2>
                <div className="space-y-3">
                  {list.map((t) => {
                    const mins = minutesSince(t.createdAt);
                    const late = col.status !== 'READY' && mins >= 20;
                    return (
                      <article key={t.id} className={`rounded-lg border bg-white p-3 ${late ? 'border-red-400 ring-2 ring-red-200' : 'border-stone-200'}`}>
                        <header className="mb-2 flex items-baseline justify-between">
                          <span className="text-xl font-bold">{t.label}</span>
                          <span className="text-sm text-stone-500">{t.tableCode ? `Table ${t.tableCode}` : t.orderType === 'TAKEAWAY' ? 'Takeaway' : 'Counter'}</span>
                        </header>
                        <ul className="space-y-1">
                          {t.items.map((i, n) => (
                            <li key={n} className="text-base">
                              <span className="font-semibold tabular-nums">{i.quantity}×</span> {i.name}
                              {i.variantName && <span className="text-stone-600"> ({i.variantName})</span>}
                              {i.addons && i.addons.length > 0 && <span className="block pl-6 text-sm text-stone-600">+ {i.addons.join(', ')}</span>}
                              {i.notes && <span className="block pl-6 text-sm font-medium text-amber-800">{i.notes}</span>}
                            </li>
                          ))}
                        </ul>
                        <footer className="mt-3 flex items-center justify-between">
                          <span className={`text-sm tabular-nums ${late ? 'font-semibold text-red-700' : 'text-stone-500'}`}>{mins} min</span>
                          <Button className="min-h-11 px-5 text-base" disabled={action.busy} onClick={() => move(t, col.action.to)}>{col.action.label}</Button>
                        </footer>
                      </article>
                    );
                  })}
                  {list.length === 0 && <p className="py-6 text-center text-sm text-stone-400">Nothing here</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
