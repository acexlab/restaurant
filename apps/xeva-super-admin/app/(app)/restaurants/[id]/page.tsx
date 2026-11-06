'use client';

import { Badge, Button, Card, ErrorBanner, Field, formatDate, formatDateTime, humanize, Input, Loading, PageHeader, Select, Table, Td, useAction, useLoad, useSession } from '@xeva/ui';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

interface Detail {
  tenant: { id: string; name: string; slug: string; status: string; gstin: string | null; createdAt: string };
  branches: { id: string; code: string; name: string; city: string | null }[];
  subscriptions: { id: string; status: string; currentPeriodEnd: string; trialEndsAt: string | null; plan: { code: string; name: string } }[];
  installations: { id: string; moduleId: string; status: string; activatedAt: string | null }[];
  employeeCount: number;
  supportGrants: { id: string; reason: string; expiresAt: string; revokedAt: string | null; createdAt: string }[];
}
interface Plan { code: string; name: string; isActive: boolean }

const SUB_STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'GRACE', 'SUSPENDED', 'CANCELLED'];

export default function RestaurantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { request } = useSession();
  const action = useAction();
  const [sub, setSub] = useState<{ planCode: string; status: string } | null>(null);
  const [grant, setGrant] = useState({ reason: '', hours: '1' });

  const { data, error, reload } = useLoad(async () => {
    const [detail, plans] = await Promise.all([request<Detail>(`/platform/tenants/${id}`), request<Plan[]>('/platform/plans')]);
    const current = detail.subscriptions[0];
    setSub({ planCode: current?.plan.code ?? plans[0]?.code ?? '', status: current?.status ?? 'TRIAL' });
    return { detail, plans: plans.filter((p) => p.isActive) };
  }, [id, request]);

  const run = async (fn: () => Promise<unknown>) => {
    await action.run(fn);
    reload();
  };

  const saveSubscription = (e: FormEvent) => {
    e.preventDefault();
    void run(() => request(`/platform/tenants/${id}/subscription`, { method: 'PUT', body: sub }));
  };
  const requestAccess = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await request(`/tenants/${id}/support-access`, { method: 'POST', body: { reason: grant.reason, hours: Number(grant.hours) } });
      setGrant({ reason: '', hours: '1' });
    });
  };
  const setStatus = (status: string) => {
    if (status !== 'ACTIVE' && !confirm(`Mark this restaurant ${status.toLowerCase()}? This is recorded in the audit log.`)) return;
    void run(() => request(`/platform/tenants/${id}`, { method: 'PATCH', body: { status } }));
  };

  if (!data) return <>{error ? <ErrorBanner error={error} /> : <Loading />}</>;
  const { detail, plans } = data;
  const current = detail.subscriptions[0];
  const liveGrant = detail.supportGrants.find((g) => !g.revokedAt && new Date(g.expiresAt) > new Date());

  return (
    <>
      <PageHeader
        title={detail.tenant.name}
        description={`${detail.tenant.slug}.xeva.in · joined ${formatDate(detail.tenant.createdAt)} · ${detail.employeeCount} team members`}
        actions={
          detail.tenant.status === 'ACTIVE' ? (
            <Button variant="danger" disabled={action.busy} onClick={() => setStatus('SUSPENDED')}>Suspend</Button>
          ) : (
            <Button disabled={action.busy} onClick={() => setStatus('ACTIVE')}>Reactivate</Button>
          )
        }
      />
      <ErrorBanner error={action.error} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2">Subscription {current && <Badge>{current.status}</Badge>}</span>}>
          {current && (
            <p className="mb-4 text-sm text-stone-600">
              {current.plan.name} · {current.trialEndsAt ? `trial ends ${formatDate(current.trialEndsAt)}` : `period ends ${formatDate(current.currentPeriodEnd)}`}
            </p>
          )}
          {sub && (
            <form onSubmit={saveSubscription} className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
              <Field label="Plan">
                <Select value={sub.planCode} onChange={(e) => setSub({ ...sub, planCode: e.target.value })}>
                  {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={sub.status} onChange={(e) => setSub({ ...sub, status: e.target.value })}>
                  {SUB_STATUSES.map((s) => <option key={s} value={s}>{humanize(s.toLowerCase())}</option>)}
                </Select>
              </Field>
              <Button type="submit" disabled={action.busy}>{current ? 'Update' : 'Assign'}</Button>
            </form>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2">Restaurant status <Badge>{detail.tenant.status}</Badge></span>}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-stone-500">GSTIN</dt><dd className="font-mono text-xs">{detail.tenant.gstin ?? '—'}</dd></div>
            <div><dt className="text-stone-500">Branches</dt><dd>{detail.branches.map((b) => `${b.name}${b.city ? ` (${b.city})` : ''}`).join(', ')}</dd></div>
          </dl>
        </Card>

        <Card title="Installed products">
          {detail.installations.length === 0 ? <p className="text-sm text-stone-500">None yet.</p> : (
            <Table head={['Product', 'Status', 'Activated']}>
              {detail.installations.map((i) => (
                <tr key={i.id}>
                  <Td className="font-medium text-stone-900">{humanize(i.moduleId)}</Td>
                  <Td><Badge>{i.status}</Badge></Td>
                  <Td>{formatDate(i.activatedAt)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Support access">
          <p className="mb-3 text-sm text-stone-600">
            Opening the restaurant&apos;s operational data needs a time-limited grant. The restaurant sees every grant in its audit log.
          </p>
          {liveGrant ? (
            <p className="mb-3 text-sm text-emerald-700">Active until {formatDateTime(liveGrant.expiresAt)}: {liveGrant.reason}</p>
          ) : (
            <form onSubmit={requestAccess} className="grid gap-3 sm:grid-cols-[1fr_6rem_auto] sm:items-end">
              <Field label="Reason"><Input required minLength={10} maxLength={500} value={grant.reason} placeholder="Ticket #123: kitchen tickets not arriving" onChange={(e) => setGrant({ ...grant, reason: e.target.value })} /></Field>
              <Field label="Hours"><Input type="number" min={0.25} max={4} step={0.25} value={grant.hours} onChange={(e) => setGrant({ ...grant, hours: e.target.value })} /></Field>
              <Button type="submit" variant="secondary" disabled={action.busy}>Grant</Button>
            </form>
          )}
          {detail.supportGrants.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-stone-100 pt-3 text-xs text-stone-500">
              {detail.supportGrants.map((g) => <li key={g.id}>{formatDateTime(g.createdAt)}: {g.reason}</li>)}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
