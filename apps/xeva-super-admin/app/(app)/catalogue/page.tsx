'use client';

import { Badge, Card, ErrorBanner, humanize, Loading, PageHeader, Table, Td, useLoad, useSession } from '@xeva/ui';

interface ModuleRow {
  id: string;
  name: string;
  version: string;
  category: string;
  availability: string;
  definition: { publishes: string[]; consumes: string[]; features: unknown[] };
}

export default function CataloguePage() {
  const { request } = useSession();
  const { data, error } = useLoad(() => request<ModuleRow[]>('/modules'), [request]);

  return (
    <>
      <PageHeader title="Product Catalogue" description="Every Xeva product, defined in @xeva/contracts and seeded into the registry." />
      <ErrorBanner error={error} />
      <Card>
        {!data ? <Loading /> : (
          <Table head={['Product', 'Category', 'Version', 'Availability', 'Features', 'Events out / in']}>
            {data.map((m) => (
              <tr key={m.id}>
                <Td><span className="font-medium text-stone-900">{m.name}</span><div className="font-mono text-xs text-stone-500">{m.id}</div></Td>
                <Td>{humanize(m.category)}</Td>
                <Td className="font-mono text-xs">{m.version}</Td>
                <Td><Badge>{m.availability}</Badge></Td>
                <Td>{m.definition.features.length}</Td>
                <Td>{m.definition.publishes.length} / {m.definition.consumes.length}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
