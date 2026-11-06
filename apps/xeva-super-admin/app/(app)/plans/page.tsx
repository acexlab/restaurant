'use client';

import { Badge, Card, ErrorBanner, formatPaise, humanize, Loading, PageHeader, Table, Td, useLoad, useSession } from '@xeva/ui';

interface Plan {
  id: string;
  code: string;
  name: string;
  interval: string;
  priceInPaise: number;
  perBranchPriceInPaise: number;
  moduleIds: string[];
  trialDays: number;
  isActive: boolean;
}

export default function PlansPage() {
  const { request } = useSession();
  const { data, error } = useLoad(() => request<Plan[]>('/platform/plans'), [request]);

  return (
    <>
      <PageHeader title="Subscription Plans" description="Plans decide which products a restaurant may activate." />
      <ErrorBanner error={error} />
      <Card>
        {!data ? <Loading /> : (
          <Table head={['Plan', 'Price', 'Per branch', 'Trial', 'Includes', 'Status']}>
            {data.map((p) => (
              <tr key={p.id}>
                <Td><span className="font-medium text-stone-900">{p.name}</span><div className="font-mono text-xs text-stone-500">{p.code}</div></Td>
                <Td className="whitespace-nowrap">{formatPaise(p.priceInPaise)} / {p.interval.toLowerCase()}</Td>
                <Td>{formatPaise(p.perBranchPriceInPaise)}</Td>
                <Td>{p.trialDays} days</Td>
                <Td className="text-xs">{p.moduleIds.map(humanize).join(', ')}</Td>
                <Td><Badge>{p.isActive ? 'ACTIVE' : 'DISABLED'}</Badge></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
