'use client';

import { Badge, Button, Card, ErrorBanner, formatDateTime, humanize, Loading, PageHeader, Table, Td, useAction } from '@xeva/ui';
import { useEffect, useState } from 'react';
import { useTenant } from '../tenant';

interface Entry { id: string; action: string; entityType: string; entityId: string | null; actorType: string; createdAt: string }

export default function AuditPage() {
  const { call } = useTenant();
  const action = useAction();
  const [items, setItems] = useState<Entry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  const load = (before?: string) =>
    action.run(async () => {
      const page = await call<{ items: Entry[]; nextCursor: string | null }>(`/audit-logs?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`);
      setItems((prev) => (before && prev ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
    });

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader title="Audit Log" description="Every sensitive change in your restaurant, who made it and when. Entries cannot be edited or deleted." />
      <ErrorBanner error={action.error} />
      <Card>
        {!items ? <Loading /> : (
          <>
            <Table head={['When', 'Action', 'Record', 'By']}>
              {items.map((a) => (
                <tr key={a.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(a.createdAt)}</Td>
                  <Td className="font-medium text-stone-900">{humanize(a.action)}</Td>
                  <Td>{a.entityType}</Td>
                  <Td><Badge tone={a.actorType === 'PLATFORM_ADMIN' ? 'amber' : 'gray'}>{a.actorType === 'PLATFORM_ADMIN' ? 'Xeva support' : 'Staff'}</Badge></Td>
                </tr>
              ))}
            </Table>
            {cursor && <Button variant="secondary" className="mt-4" disabled={action.busy} onClick={() => load(cursor)}>Load more</Button>}
          </>
        )}
      </Card>
    </>
  );
}
