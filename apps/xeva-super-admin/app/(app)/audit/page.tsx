'use client';

import { Badge, Card, ErrorBanner, formatDateTime, humanize, Loading, PageHeader, Table, Td, useLoad, useSession } from '@xeva/ui';

interface Entry { id: string; tenantId: string | null; action: string; entityType: string; actorType: string; createdAt: string }

export default function PlatformAuditPage() {
  const { request } = useSession();
  const { data, error } = useLoad(() => request<Entry[]>('/platform/audit-logs?limit=200'), [request]);

  return (
    <>
      <PageHeader title="Audit Logs" description="The latest 200 audited actions across the platform. Entries cannot be edited or deleted." />
      <ErrorBanner error={error} />
      <Card>
        {!data ? <Loading /> : (
          <Table head={['When', 'Action', 'Record', 'Actor', 'Restaurant']}>
            {data.map((a) => (
              <tr key={a.id}>
                <Td className="whitespace-nowrap">{formatDateTime(a.createdAt)}</Td>
                <Td className="font-medium text-stone-900">{humanize(a.action)}</Td>
                <Td>{a.entityType}</Td>
                <Td><Badge tone={a.actorType === 'PLATFORM_ADMIN' ? 'amber' : 'gray'}>{a.actorType}</Badge></Td>
                <Td className="font-mono text-xs">{a.tenantId?.slice(0, 8) ?? 'platform'}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
