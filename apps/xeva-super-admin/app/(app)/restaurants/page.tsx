'use client';

import { Badge, Button, Card, ErrorBanner, Field, formatDate, Input, Loading, PageHeader, SecretNotice, Select, Table, Td, useAction, useLoad, useSession } from '@xeva/ui';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

interface TenantRow { id: string; slug: string; name: string; status: string; createdAt: string }
interface Plan { code: string; name: string; isActive: boolean }

const empty = { name: '', slug: '', ownerEmail: '', ownerName: '', planCode: '', branchCode: 'MAIN', branchName: '', city: '' };

export default function RestaurantsPage() {
  const { request } = useSession();
  const action = useAction();
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const { data, error, reload } = useLoad(async () => {
    const [tenants, plans] = await Promise.all([request<TenantRow[]>('/tenants'), request<Plan[]>('/platform/plans')]);
    return { tenants, plans: plans.filter((p) => p.isActive) };
  }, [request]);

  const onboard = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      const res = await request<{ ownerTemporaryPassword: string | null }>('/tenants', {
        method: 'POST',
        body: {
          name: form.name,
          slug: form.slug,
          ownerEmail: form.ownerEmail,
          ownerName: form.ownerName || undefined,
          planCode: form.planCode || undefined,
          firstBranch: { code: form.branchCode, name: form.branchName || form.name, city: form.city || undefined },
        },
      });
      if (res.ownerTemporaryPassword) setSecret({ email: form.ownerEmail, password: res.ownerTemporaryPassword });
      setForm(empty);
      setShowForm(false);
      reload();
    });
  };

  return (
    <>
      <PageHeader
        title="Restaurants"
        description="Every restaurant account on the platform."
        actions={!showForm && <Button onClick={() => setShowForm(true)}>Onboard restaurant</Button>}
      />
      <ErrorBanner error={error ?? action.error} />
      {secret && <SecretNotice label={`Owner account created for ${secret.email}. Temporary password:`} value={secret.password} onDismiss={() => setSecret(null)} />}

      {showForm && data && (
        <Card title="Onboard a restaurant" className="mb-4">
          <form onSubmit={onboard} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Restaurant name"><Input required minLength={2} value={form.name} onChange={set('name')} /></Field>
              <Field label="Portal address" hint={`Lowercase, digits and hyphens: ${form.slug || 'my-restaurant'}.xeva.in`}>
                <Input required pattern="^[a-z0-9][a-z0-9\-]{1,46}[a-z0-9]$" value={form.slug} onChange={set('slug')} />
              </Field>
              <Field label="Owner email"><Input required type="email" value={form.ownerEmail} onChange={set('ownerEmail')} /></Field>
              <Field label="Owner name" hint="Needed only if the owner has no Xeva account yet.">
                <Input value={form.ownerName} onChange={set('ownerName')} />
              </Field>
              <Field label="Plan" hint="Starts a trial. Leave empty to assign later.">
                <Select value={form.planCode} onChange={set('planCode')}>
                  <option value="">No plan yet</option>
                  {data.plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                </Select>
              </Field>
            </div>
            <fieldset className="grid gap-4 border-t border-stone-100 pt-4 md:grid-cols-3">
              <legend className="mb-2 text-sm font-medium text-stone-700">First branch</legend>
              <Field label="Code"><Input required maxLength={20} value={form.branchCode} onChange={set('branchCode')} /></Field>
              <Field label="Name" hint="Defaults to the restaurant name."><Input value={form.branchName} onChange={set('branchName')} /></Field>
              <Field label="City"><Input value={form.city} placeholder="Kochi" onChange={set('city')} /></Field>
            </fieldset>
            <div className="flex gap-2">
              <Button type="submit" disabled={action.busy}>{action.busy ? 'Creating…' : 'Create restaurant'}</Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {!data ? <Loading /> : (
          <Table head={['Restaurant', 'Portal', 'Status', 'Joined']}>
            {data.tenants.map((t) => (
              <tr key={t.id}>
                <Td><Link href={`/restaurants/${t.id}`} className="font-medium text-[var(--brand)] hover:underline">{t.name}</Link></Td>
                <Td className="font-mono text-xs">{t.slug}.xeva.in</Td>
                <Td><Badge>{t.status}</Badge></Td>
                <Td>{formatDate(t.createdAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
