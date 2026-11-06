'use client';

import { Badge, Card, ErrorBanner, formatDate, formatDateTime, humanize, Loading, PageHeader } from '@xeva/ui';
import Link from 'next/link';
import { useLoad } from '@xeva/ui';
import { useTenant } from './tenant';

interface Installed { moduleId: string; name: string; status: string }
interface Subscription { status: string; currentPeriodEnd: string; trialEndsAt: string | null; plan: { name: string } }
interface AuditEntry { id: string; action: string; entityType: string; createdAt: string }

export default function OverviewPage() {
  const { tenant, can, call } = useTenant();
  const { data, error } = useLoad(async () => {
    const [modules, deadLetters, subscription, audit] = await Promise.all([
      can('modules') ? call<Installed[]>(`/tenants/${tenant.id}/modules`) : null,
      can('integrations') ? call<unknown[]>('/integration-events?status=DEAD_LETTER') : null,
      can('billing') ? call<Subscription | null>(`/tenants/${tenant.id}/subscription`) : null,
      can('audit') ? call<{ items: AuditEntry[] }>('/audit-logs?limit=6') : null,
    ]);
    return { modules, deadLetters, subscription, audit };
  }, [tenant.id]);

  return (
    <>
      <PageHeader title={`Welcome to ${tenant.name}`} description={tenant.branding?.tagline ?? 'Your restaurant at a glance.'} />
      <ErrorBanner error={error} />
      {!data ? (
        <Loading />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.modules && (
            <Card title="Active products" actions={<Link className="text-sm text-[var(--brand)] hover:underline" href="/modules">Manage</Link>}>
              {data.modules.filter((m) => m.status === 'ACTIVE').length === 0 ? (
                <p className="text-sm text-stone-500">No products active yet. Activate one from Product Modules.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {data.modules.filter((m) => m.status === 'ACTIVE').map((m) => (
                    <li key={m.moduleId} className="rounded-md border border-stone-200 px-2.5 py-1 text-sm">{m.name}</li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {data.deadLetters && (
            <Card title="Integration health" actions={<Link className="text-sm text-[var(--brand)] hover:underline" href="/integrations">Open centre</Link>}>
              {data.deadLetters.length === 0 ? (
                <p className="text-sm text-emerald-700">All connected products are exchanging events normally.</p>
              ) : (
                <p className="text-sm text-amber-800">
                  {data.deadLetters.length} event{data.deadLetters.length > 1 ? 's' : ''} failed to deliver and need attention.
                </p>
              )}
            </Card>
          )}
          {data.subscription !== null && can('billing') && (
            <Card title="Subscription">
              {data.subscription ? (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{data.subscription.plan.name} <Badge>{data.subscription.status}</Badge></p>
                  <p className="text-stone-500">
                    {data.subscription.trialEndsAt ? `Trial ends ${formatDate(data.subscription.trialEndsAt)}` : `Renews ${formatDate(data.subscription.currentPeriodEnd)}`}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-stone-500">No subscription yet. Contact Xeva to choose a plan.</p>
              )}
            </Card>
          )}
          {data.audit && (
            <Card title="Recent activity" actions={<Link className="text-sm text-[var(--brand)] hover:underline" href="/audit">View all</Link>}>
              <ul className="space-y-2 text-sm">
                {data.audit.items.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3">
                    <span>{humanize(a.action)}</span>
                    <span className="shrink-0 text-stone-500">{formatDateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
