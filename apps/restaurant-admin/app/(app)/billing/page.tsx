'use client';

import { Badge, Card, ErrorBanner, formatDate, formatPaise, Loading, PageHeader, useLoad } from '@xeva/ui';
import { useTenant } from '../tenant';

interface Subscription {
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  plan: { name: string; interval: string; priceInPaise: number; perBranchPriceInPaise: number; moduleIds: string[] };
}

export default function BillingPage() {
  const { tenant, call } = useTenant();
  const { data, error, loading } = useLoad(() => call<Subscription | null>(`/tenants/${tenant.id}/subscription`), [tenant.id]);

  return (
    <>
      <PageHeader title="Subscription and Billing" description="Your Xeva plan. To change plans, contact the Xeva team." />
      <ErrorBanner error={error} />
      {loading ? <Loading /> : !data ? (
        <Card><p className="text-sm text-stone-500">No subscription yet.</p></Card>
      ) : (
        <Card title={<span className="flex items-center gap-2">{data.plan.name} <Badge>{data.status}</Badge></span>}>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-stone-500">Price</dt><dd className="font-medium">{formatPaise(data.plan.priceInPaise)} / {data.plan.interval.toLowerCase()}</dd></div>
            <div><dt className="text-stone-500">Per extra branch</dt><dd className="font-medium">{formatPaise(data.plan.perBranchPriceInPaise)}</dd></div>
            <div><dt className="text-stone-500">{data.trialEndsAt ? 'Trial ends' : 'Current period ends'}</dt><dd className="font-medium">{formatDate(data.trialEndsAt ?? data.currentPeriodEnd)}</dd></div>
          </dl>
          <p className="mt-4 text-sm text-stone-600">Included products: {data.plan.moduleIds.join(', ').replace(/_/g, ' ')}</p>
        </Card>
      )}
    </>
  );
}
