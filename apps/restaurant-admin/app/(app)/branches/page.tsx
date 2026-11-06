'use client';

import { Badge, Button, Card, ErrorBanner, Field, Input, Loading, PageHeader, Table, Td, useAction, useLoad } from '@xeva/ui';
import { useState, type FormEvent } from 'react';
import { useTenant } from '../tenant';

interface Branch { id: string; code: string; name: string; city: string | null; state: string; isActive: boolean }

export default function BranchesPage() {
  const { tenant, call, can } = useTenant();
  const action = useAction();
  const [form, setForm] = useState({ code: '', name: '', city: '' });
  const { data, error, reload } = useLoad(() => call<Branch[]>(`/tenants/${tenant.id}/branches`), [tenant.id]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      await call(`/tenants/${tenant.id}/branches`, { method: 'POST', body: { ...form, city: form.city || undefined } });
      setForm({ code: '', name: '', city: '' });
      reload();
    });
  };

  return (
    <>
      <PageHeader title="Branches" description="Every outlet of your restaurant. Staff roles can be limited to a single branch." />
      <ErrorBanner error={error ?? action.error} />
      {can('settings') && (
        <Card title="Add a branch" className="mb-4">
          <form onSubmit={add} className="grid gap-3 md:grid-cols-[8rem_1fr_1fr_auto] md:items-end">
            <Field label="Code"><Input required maxLength={20} placeholder="KOC-02" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Button type="submit" disabled={action.busy}>Add</Button>
          </form>
        </Card>
      )}
      <Card title="All branches">
        {!data ? <Loading /> : (
          <Table head={['Code', 'Name', 'Location', 'Status']}>
            {data.map((b) => (
              <tr key={b.id}>
                <Td className="font-mono text-xs">{b.code}</Td>
                <Td className="font-medium text-stone-900">{b.name}</Td>
                <Td>{[b.city, b.state].filter(Boolean).join(', ')}</Td>
                <Td><Badge>{b.isActive ? 'ACTIVE' : 'DISABLED'}</Badge></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
