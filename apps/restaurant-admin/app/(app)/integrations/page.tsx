'use client';

import { Badge, Button, Card, Empty, ErrorBanner, formatDateTime, Loading, PageHeader, Table, Td, useAction, useLoad } from '@xeva/ui';
import { Fragment, useState } from 'react';
import { useTenant } from '../tenant';

interface CatalogModule { id: string; name: string; definition: { publishes: string[]; consumes: string[] } }
interface Installed { moduleId: string; status: string }
interface Integration {
  id: string;
  sourceModule: string;
  destinationModule: string;
  status: string;
  lastSuccessfulEventAt: string | null;
  errorCount: number;
}
interface Delivery {
  id: string;
  consumer: string;
  status: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
  event: { eventName: string; entityId: string; sourceModule: string };
}
interface TestResult { ok: boolean; checks: Record<string, boolean>; flowingEvents: string[] }

export default function IntegrationCentrePage() {
  const { tenant, call, can } = useTenant();
  const configure = can('modules'); // owners/admins; the API re-checks integrations.configure
  const action = useAction();
  const [tests, setTests] = useState<Record<string, TestResult>>({});
  const [openEvents, setOpenEvents] = useState<{ id: string; rows: Delivery[] } | null>(null);

  const { data, error, reload } = useLoad(async () => {
    const [catalog, installed, integrations, deadLetters] = await Promise.all([
      call<CatalogModule[]>('/modules'),
      call<Installed[]>(`/tenants/${tenant.id}/modules`),
      call<Integration[]>('/integrations'),
      call<Delivery[]>('/integration-events?status=DEAD_LETTER'),
    ]);
    const byId = new Map(catalog.map((m) => [m.id, m]));
    const active = installed.filter((i) => i.status === 'ACTIVE').map((i) => i.moduleId);
    const connected = new Set(integrations.map((i) => `${i.sourceModule}>${i.destinationModule}`));
    // Compatible = the source publishes at least one event the destination consumes.
    const suggestions = active.flatMap((src) =>
      active
        .filter((dst) => dst !== src && !connected.has(`${src}>${dst}`))
        .map((dst) => ({ src, dst, events: byId.get(src)!.definition.publishes.filter((e) => byId.get(dst)!.definition.consumes.includes(e)) }))
        .filter((s) => s.events.length > 0),
    );
    return { name: (id: string) => byId.get(id)?.name ?? id, integrations, suggestions, deadLetters };
  }, [tenant.id]);

  const act = async (fn: () => Promise<unknown>) => {
    await action.run(fn);
    reload();
  };
  const test = (id: string) =>
    action.run(async () => {
      const r = await call<TestResult>(`/integrations/${id}/test`, { method: 'POST' });
      setTests((t) => ({ ...t, [id]: r }));
    });
  const showEvents = (id: string) =>
    openEvents?.id === id
      ? setOpenEvents(null)
      : action.run(async () => setOpenEvents({ id, rows: await call<Delivery[]>(`/integrations/${id}/events`) }));

  return (
    <>
      <PageHeader title="Integration Centre" description="Connect your products so orders, tickets and payments flow between them automatically." />
      <ErrorBanner error={error ?? action.error} />
      {!data ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <Card title="Connections">
            {data.integrations.length === 0 ? (
              <Empty>No connections yet. Connect compatible products below.</Empty>
            ) : (
              <Table head={['From', 'To', 'Status', 'Last event', 'Failures', '']}>
                {data.integrations.map((i) => (
                  <Fragment key={i.id}>
                    <tr>
                      <Td className="font-medium text-stone-900">{data.name(i.sourceModule)}</Td>
                      <Td>{data.name(i.destinationModule)}</Td>
                      <Td><Badge>{i.status}</Badge></Td>
                      <Td>{formatDateTime(i.lastSuccessfulEventAt)}</Td>
                      <Td>{i.errorCount}</Td>
                      <Td className="whitespace-nowrap text-right">
                        <Button variant="ghost" disabled={action.busy} onClick={() => test(i.id)}>Test</Button>
                        <Button variant="ghost" disabled={action.busy} onClick={() => showEvents(i.id)}>Events</Button>
                        {configure && (i.status === 'ACTIVE' ? (
                          <Button variant="ghost" disabled={action.busy} onClick={() => act(() => call(`/integrations/${i.id}/disable`, { method: 'POST' }))}>Disconnect</Button>
                        ) : (
                          <Button variant="ghost" disabled={action.busy} onClick={() => act(() => call(`/integrations/${i.id}/enable`, { method: 'POST' }))}>Reconnect</Button>
                        ))}
                      </Td>
                    </tr>
                    {tests[i.id] && (
                      <tr>
                        <td colSpan={6} className="bg-stone-50 px-5 py-2 text-xs">
                          <span className={tests[i.id].ok ? 'font-medium text-emerald-700' : 'font-medium text-amber-800'}>
                            {tests[i.id].ok ? 'Connection healthy.' : 'Connection has problems.'}
                          </span>{' '}
                          {Object.entries(tests[i.id].checks).map(([k, v]) => `${v ? '✓' : '✗'} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`).join(' · ')}
                          {' · events: '}{tests[i.id].flowingEvents.join(', ') || 'none'}
                        </td>
                      </tr>
                    )}
                    {openEvents?.id === i.id && (
                      <tr>
                        <td colSpan={6} className="bg-stone-50 px-5 py-2 text-xs">
                          {openEvents.rows.length === 0 ? 'No events delivered through this connection yet.' : (
                            <ul className="space-y-1">
                              {openEvents.rows.map((d) => (
                                <li key={d.id}>
                                  <Badge>{d.status}</Badge> {d.event.eventName} · {d.event.entityId} · {formatDateTime(d.updatedAt)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </Table>
            )}
          </Card>

          {configure && (
            <Card title="Available connections">
              {data.suggestions.length === 0 ? (
                <Empty>No more compatible products to connect. Activate more products to unlock connections.</Empty>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {data.suggestions.map((s) => (
                    <li key={`${s.src}>${s.dst}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                      <div>
                        <p className="font-medium text-stone-900">{data.name(s.src)} → {data.name(s.dst)}</p>
                        <p className="text-xs text-stone-500">Shares: {s.events.join(', ')}</p>
                      </div>
                      <Button
                        disabled={action.busy}
                        onClick={() => act(() => call('/integrations', { method: 'POST', body: { sourceModule: s.src, destinationModule: s.dst } }))}
                      >
                        Connect
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card title="Failed events">
            {data.deadLetters.length === 0 ? (
              <Empty>Nothing failed. Every event reached its destination.</Empty>
            ) : (
              <Table head={['Event', 'Destination', 'Attempts', 'Error', '']}>
                {data.deadLetters.map((d) => (
                  <tr key={d.id}>
                    <Td className="font-medium text-stone-900">{d.event.eventName}<div className="text-xs font-normal text-stone-500">{d.event.entityId}</div></Td>
                    <Td>{data.name(d.consumer)}</Td>
                    <Td>{d.attempts}</Td>
                    <Td className="max-w-xs text-xs text-red-700">{d.lastError}</Td>
                    <Td className="text-right">
                      {configure && <Button variant="secondary" disabled={action.busy} onClick={() => act(() => call(`/integration-events/${d.id}/replay`, { method: 'POST' }))}>Retry</Button>}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
