'use client';

import { Card, ErrorBanner, humanize, Loading, PageHeader, useLoad, useSession } from '@xeva/ui';
import Link from 'next/link';

interface Overview {
  tenantsByStatus: Record<string, number>;
  subscriptionsByStatus: Record<string, number>;
  activeInstallsByModule: Record<string, number>;
  deadLetters: number;
  events24h: number;
}

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

function Stat({ label, value, sub, alert }: { label: string; value: number; sub?: string; alert?: boolean }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-sm text-stone-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? 'text-red-700' : 'text-stone-900'}`}>{value.toLocaleString('en-IN')}</p>
      {sub && <p className="mt-1 text-xs text-stone-500">{sub}</p>}
    </div>
  );
}

const breakdown = (r: Record<string, number>) => Object.entries(r).map(([k, v]) => `${v} ${k.toLowerCase().replace(/_/g, ' ')}`).join(' · ');

export default function OverviewPage() {
  const { request } = useSession();
  const { data, error } = useLoad(() => request<Overview>('/platform/overview'), [request]);

  return (
    <>
      <PageHeader title="Platform Overview" description="Health of every restaurant on Xeva." />
      <ErrorBanner error={error} />
      {!data ? <Loading /> : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Restaurants" value={sum(data.tenantsByStatus)} sub={breakdown(data.tenantsByStatus)} />
            <Stat label="Subscriptions" value={sum(data.subscriptionsByStatus)} sub={breakdown(data.subscriptionsByStatus)} />
            <Stat label="Events in last 24 h" value={data.events24h} />
            <Stat label="Failed deliveries" value={data.deadLetters} alert={data.deadLetters > 0} sub={data.deadLetters ? 'See Integration Monitoring' : 'None'} />
          </div>
          <Card title="Active installs by product" actions={<Link href="/catalogue" className="text-sm text-[var(--brand)] hover:underline">Catalogue</Link>}>
            {Object.keys(data.activeInstallsByModule).length === 0 ? (
              <p className="text-sm text-stone-500">No active products yet.</p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(data.activeInstallsByModule).sort((a, b) => b[1] - a[1]).map(([id, n]) => (
                  <li key={id} className="flex items-center gap-3 text-sm">
                    <span className="w-48 shrink-0 truncate">{humanize(id)}</span>
                    <span className="h-2 rounded-full bg-[var(--brand)]" style={{ width: `${(n / Math.max(...Object.values(data.activeInstallsByModule))) * 60}%` }} />
                    <span className="tabular-nums text-stone-600">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
