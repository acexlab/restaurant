'use client';

import { Badge, Card, Empty, ErrorBanner, formatDateTime, humanize, Loading, PageHeader, Select, Table, Td, useLoad, useSession } from '@xeva/ui';
import Link from 'next/link';
import { useState } from 'react';

interface Delivery {
  id: string;
  tenantId: string;
  tenantName: string;
  consumer: string;
  status: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
  event: { eventName: string; sourceModule: string; entityId: string };
}

export default function IntegrationMonitoringPage() {
  const { request } = useSession();
  const [status, setStatus] = useState('DEAD_LETTER');
  const { data, error } = useLoad(() => request<Delivery[]>(`/platform/integration-events${status ? `?status=${status}` : ''}`), [status, request]);

  return (
    <>
      <PageHeader
        title="Integration Monitoring"
        description="Event deliveries across all restaurants. Restaurants retry their own failed events from their Integration Centre."
        actions={
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
            <option value="DEAD_LETTER">Failed (dead letter)</option>
            <option value="FAILED">Retrying</option>
            <option value="PENDING">Pending</option>
            <option value="SUCCEEDED">Delivered</option>
            <option value="">All</option>
          </Select>
        }
      />
      <ErrorBanner error={error} />
      <Card>
        {!data ? <Loading /> : data.length === 0 ? <Empty>No deliveries with this status.</Empty> : (
          <Table head={['Restaurant', 'Event', 'Route', 'Status', 'Attempts', 'Updated', 'Error']}>
            {data.map((d) => (
              <tr key={d.id}>
                <Td><Link href={`/restaurants/${d.tenantId}`} className="text-[var(--brand)] hover:underline">{d.tenantName}</Link></Td>
                <Td className="font-medium text-stone-900">{d.event.eventName}</Td>
                <Td className="whitespace-nowrap text-xs">{humanize(d.event.sourceModule)} → {humanize(d.consumer)}</Td>
                <Td><Badge>{d.status}</Badge></Td>
                <Td>{d.attempts}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(d.updatedAt)}</Td>
                <Td className="max-w-xs text-xs text-red-700">{d.lastError}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
