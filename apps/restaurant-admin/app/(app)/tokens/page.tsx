'use client';

import { Badge, Button, Card, Empty, ErrorBanner, Field, formatDateTime, Input, Loading, PageHeader, Select, Toggle, useAction, useLoad } from '@xeva/ui';
import { useEffect, useState, type FormEvent } from 'react';
import { CUSTOMER_URL } from '../shared';
import { useTenant } from '../tenant';

interface Queue { id: string; name: string; prefix: string; isActive: boolean; averageServiceMinutes: number; today: Record<string, number> }
interface Token {
  id: string;
  label: string;
  status: string;
  priority: boolean;
  source: string;
  customerName: string | null;
  partySize: number | null;
  calledAt: string | null;
  calledCount: number;
  estimatedWaitMinutes?: number | null;
}
interface Board {
  queue: Queue;
  called: Token[];
  waiting: Token[];
  skipped: Token[];
  features: { priority: boolean; display: boolean; remote: boolean };
}
interface Report { issued: number; byStatus: Record<string, number>; averageWaitMinutes: number | null }
type Call = <T>(path: string, opts?: { method?: 'POST' | 'PATCH'; body?: unknown }) => Promise<T>;

const REFRESH_MS = 5000;

export default function TokensPage() {
  const { tenant, call } = useTenant();
  const queues = useLoad(() => call<Queue[]>('/queues'), [tenant.id]);
  const [queueId, setQueueId] = useState<string | null>(null);
  const selected = queueId ?? queues.data?.[0]?.id ?? null;

  if (queues.error) return <ErrorBanner error={queues.error} />;
  if (!queues.data) return <Loading />;

  return (
    <>
      <PageHeader
        title="Token Management"
        description="Issue tokens to walk-in guests, call them in order, and show the queue on a TV."
        actions={
          queues.data.length > 1 && (
            <Select aria-label="Queue" value={selected ?? ''} onChange={(e) => setQueueId(e.target.value)} className="w-48">
              {queues.data.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </Select>
          )
        }
      />
      {selected ? (
        <QueueBoard key={selected} queueId={selected} slug={tenant.slug} call={call} onQueuesChanged={queues.reload} />
      ) : (
        <Empty>No queues yet. Create your first one below.</Empty>
      )}
      <NewQueue call={call} onCreated={(q) => (queues.reload(), setQueueId(q.id))} />
    </>
  );
}

function QueueBoard({ queueId, slug, call, onQueuesChanged }: { queueId: string; slug: string; call: Call; onQueuesChanged: () => void }) {
  const action = useAction();
  const board = useLoad(async () => {
    const [b, r] = await Promise.all([call<Board>(`/queues/${queueId}/board`), call<Report>(`/queues/${queueId}/report`)]);
    return { ...b, report: r };
  }, [queueId]);
  const [form, setForm] = useState({ customerName: '', customerPhone: '', partySize: '', priority: false });
  const [lastIssued, setLastIssued] = useState<string | null>(null);

  // shortcut: polling every 5 s. Switch to WebSocket push (spec 13) when the realtime gateway exists.
  useEffect(() => {
    const id = setInterval(board.reload, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId]);

  const act = async (fn: () => Promise<unknown>) => {
    await action.run(fn);
    board.reload();
  };
  const setStatus = (t: Token, status: string) => act(() => call(`/tokens/${t.id}/status`, { method: 'PATCH', body: { status } }));
  const callToken = (t: Token) => act(() => call(`/tokens/${t.id}/call`, { method: 'POST' }));

  const issue = (e: FormEvent) => {
    e.preventDefault();
    void act(async () => {
      const t = await call<Token>(`/queues/${queueId}/tokens`, {
        method: 'POST',
        body: {
          customerName: form.customerName.trim() || undefined,
          customerPhone: form.customerPhone.trim() || undefined,
          partySize: form.partySize ? Number(form.partySize) : undefined,
          priority: form.priority,
        },
      });
      setLastIssued(t.label);
      setForm({ customerName: '', customerPhone: '', partySize: '', priority: false });
    });
  };

  if (!board.data) return board.error ? <ErrorBanner error={board.error} /> : <Loading />;
  const { queue, called, waiting, skipped, features, report } = board.data;
  const who = (t: Token) => [t.customerName, t.partySize ? `${t.partySize} guests` : null].filter(Boolean).join(' · ') || 'Walk-in';
  const joinUrl = `${CUSTOMER_URL}/${slug}/queue/${queueId}/join`;

  return (
    <div className="space-y-4">
      <ErrorBanner error={action.error} />

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card
          title="Now serving"
          actions={
            <Button
              disabled={action.busy || waiting.length === 0}
              onClick={() => act(() => call(`/queues/${queueId}/call-next`, { method: 'POST' }))}
            >
              Call next
            </Button>
          }
        >
          {called.length === 0 ? (
            <Empty>No one called yet.</Empty>
          ) : (
            <ul className="divide-y divide-stone-100">
              {called.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-stone-900">{t.label}</p>
                    <p className="text-sm text-stone-500">{who(t)} · called {formatDateTime(t.calledAt)}{t.calledCount > 1 ? ` (${t.calledCount}×)` : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={action.busy} onClick={() => setStatus(t, 'COMPLETED')}>Seated</Button>
                    <Button variant="secondary" disabled={action.busy} onClick={() => callToken(t)}>Call again</Button>
                    <Button variant="ghost" disabled={action.busy} onClick={() => setStatus(t, 'SKIPPED')}>No show</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Issue a token">
          {lastIssued && (
            <p role="status" className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Issued <span className="font-semibold">{lastIssued}</span>
            </p>
          )}
          {!queue.isActive && <p className="mb-3 text-sm text-amber-800">This queue is closed. Open it to issue tokens.</p>}
          <form onSubmit={issue} className="space-y-3">
            <Field label="Guest name (optional)"><Input value={form.customerName} maxLength={80} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mobile (optional)">
                <Input type="tel" inputMode="numeric" placeholder="9847012345" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value.replace(/\s/g, '') })} />
              </Field>
              <Field label="Guests"><Input type="number" min={1} max={50} value={form.partySize} onChange={(e) => setForm({ ...form, partySize: e.target.value })} /></Field>
            </div>
            {features.priority && (
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Priority (elderly, disability, VIP)</span>
                <Toggle label="Priority" checked={form.priority} onChange={(v) => setForm({ ...form, priority: v })} />
              </label>
            )}
            <Button type="submit" className="w-full" disabled={action.busy || !queue.isActive}>Issue token</Button>
          </form>
        </Card>
      </div>

      <Card title={`Waiting (${waiting.length})`}>
        {waiting.length === 0 ? (
          <Empty>Queue is empty.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {waiting.map((t, i) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-6 text-right text-xs tabular-nums text-stone-400">{i + 1}</span>
                  <span className="text-lg font-semibold tabular-nums text-stone-900">{t.label}</span>
                  {t.priority && <Badge tone="amber">priority</Badge>}
                  {t.source === 'REMOTE' && <Badge tone="blue">joined online</Badge>}
                  <span className="text-sm text-stone-500">{who(t)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {t.estimatedWaitMinutes != null && <span className="text-xs text-stone-500">~{t.estimatedWaitMinutes} min</span>}
                  <Button variant="ghost" disabled={action.busy} onClick={() => callToken(t)}>Call</Button>
                  <Button variant="ghost" disabled={action.busy} onClick={() => setStatus(t, 'CANCELLED')}>Cancel</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {skipped.length > 0 && (
        <Card title={`No shows (${skipped.length})`}>
          <ul className="flex flex-wrap gap-2">
            {skipped.map((t) => (
              <li key={t.id}>
                <Button variant="secondary" disabled={action.busy} onClick={() => callToken(t)}>Recall {t.label}</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Today">
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-stone-500">Issued</dt><dd className="text-xl font-semibold tabular-nums">{report.issued}</dd></div>
            <div><dt className="text-stone-500">Seated</dt><dd className="text-xl font-semibold tabular-nums">{report.byStatus.COMPLETED ?? 0}</dd></div>
            <div><dt className="text-stone-500">Avg. wait</dt><dd className="text-xl font-semibold tabular-nums">{report.averageWaitMinutes != null ? `${report.averageWaitMinutes} min` : '—'}</dd></div>
          </dl>
        </Card>
        <Card title="Queue settings">
          <div className="space-y-3 text-sm">
            <label className="flex items-center justify-between gap-3">
              <span>Queue open for new tokens</span>
              <Toggle
                label="Queue open"
                checked={queue.isActive}
                disabled={action.busy}
                onChange={(v) => act(async () => (await call(`/queues/${queueId}`, { method: 'PATCH', body: { isActive: v } }), onQueuesChanged()))}
              />
            </label>
            <p className="text-stone-500">Average service time: {queue.averageServiceMinutes} min (used for wait estimates).</p>
            {features.display ? (
              <p>
                TV display:{' '}
                <a className="text-[var(--brand)] hover:underline" href={`${CUSTOMER_URL}/${slug}/queue/${queueId}/display`} target="_blank" rel="noreferrer">open full screen</a>
              </p>
            ) : (
              <p className="text-stone-500">TV display is switched off in Product Modules.</p>
            )}
            {features.remote && (
              <p>
                Guests join from their phone: <a className="break-all text-[var(--brand)] hover:underline" href={joinUrl} target="_blank" rel="noreferrer">{joinUrl}</a>
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function NewQueue({ call, onCreated }: { call: Call; onCreated: (q: Queue) => void }) {
  const action = useAction();
  const [form, setForm] = useState({ name: '', prefix: 'A', averageServiceMinutes: '15' });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      const q = await call<Queue>('/queues', {
        method: 'POST',
        body: { name: form.name, prefix: form.prefix.toUpperCase(), averageServiceMinutes: Number(form.averageServiceMinutes) },
      });
      setForm({ name: '', prefix: 'A', averageServiceMinutes: '15' });
      onCreated(q);
    });
  };
  return (
    <Card title="New queue" className="mt-4">
      <ErrorBanner error={action.error} />
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_6rem_10rem_auto] md:items-end">
        <Field label="Name"><Input required maxLength={60} placeholder="Dine-in, Takeaway…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Prefix"><Input required maxLength={3} pattern="[A-Za-z]{1,3}" value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} /></Field>
        <Field label="Minutes per guest"><Input type="number" min={1} max={180} required value={form.averageServiceMinutes} onChange={(e) => setForm({ ...form, averageServiceMinutes: e.target.value })} /></Field>
        <Button type="submit" disabled={action.busy}>Create</Button>
      </form>
    </Card>
  );
}
