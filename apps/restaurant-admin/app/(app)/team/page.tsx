'use client';

import { Badge, Button, Card, ErrorBanner, Field, Input, Loading, PageHeader, SecretNotice, Select, Table, Td, useAction, useLoad, useSession } from '@xeva/ui';
import { useState, type FormEvent } from 'react';
import { useTenant } from '../tenant';

interface Role { key: string; name: string }
interface Employee { id: string; displayName: string; email: string; status: string; roles: { key: string; name: string; branchId: string | null }[] }

export default function TeamPage() {
  const { tenant, call } = useTenant();
  const { me } = useSession();
  const action = useAction();
  const [form, setForm] = useState({ email: '', fullName: '', roleKey: 'waiter' });
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);

  const { data, error, reload } = useLoad(async () => {
    const [employees, roles] = await Promise.all([
      call<Employee[]>(`/tenants/${tenant.id}/employees`),
      call<Role[]>(`/tenants/${tenant.id}/roles`),
    ]);
    return { employees, roles };
  }, [tenant.id]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      const res = await call<{ email: string; temporaryPassword: string | null }>(`/tenants/${tenant.id}/employees`, { method: 'POST', body: form });
      if (res.temporaryPassword) setSecret({ email: res.email, password: res.temporaryPassword });
      setForm({ email: '', fullName: '', roleKey: form.roleKey });
      reload();
    });
  };
  const update = (id: string, body: object) =>
    action.run(async () => {
      await call(`/tenants/${tenant.id}/employees/${id}`, { method: 'PATCH', body });
      reload();
    });

  return (
    <>
      <PageHeader title="Team" description="Give each person only the access their role needs. You can only assign roles that are within your own access." />
      <ErrorBanner error={error ?? action.error} />
      {secret && <SecretNotice label={`Temporary password for ${secret.email}`} value={secret.password} onDismiss={() => setSecret(null)} />}
      {!data ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <Card title="Add a team member">
            <form onSubmit={add} className="grid gap-3 md:grid-cols-[1fr_1fr_12rem_auto] md:items-end">
              <Field label="Full name"><Input required minLength={2} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></Field>
              <Field label="Email"><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Role">
                <Select value={form.roleKey} onChange={(e) => setForm({ ...form, roleKey: e.target.value })}>
                  {data.roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </Select>
              </Field>
              <Button type="submit" disabled={action.busy}>Add</Button>
            </form>
          </Card>

          <Card title={`Team (${data.employees.length})`}>
            <Table head={['Name', 'Role', 'Status', '']}>
              {data.employees.map((emp) => {
                const self = emp.email === me?.email;
                return (
                  <tr key={emp.id}>
                    <Td><span className="font-medium text-stone-900">{emp.displayName}</span><div className="text-xs text-stone-500">{emp.email}</div></Td>
                    <Td>
                      {self ? emp.roles.map((r) => r.name).join(', ') : (
                        <Select
                          aria-label={`Role for ${emp.displayName}`}
                          className="max-w-48"
                          value={emp.roles.find((r) => r.branchId === null)?.key ?? ''}
                          disabled={action.busy}
                          onChange={(e) => update(emp.id, { roleKeys: [e.target.value] })}
                        >
                          {data.roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                        </Select>
                      )}
                    </Td>
                    <Td><Badge>{emp.status}</Badge></Td>
                    <Td className="text-right">
                      {self ? <span className="text-xs text-stone-400">You</span> : emp.status === 'ACTIVE' ? (
                        <Button variant="ghost" disabled={action.busy} onClick={() => update(emp.id, { status: 'DISABLED' })}>Disable</Button>
                      ) : (
                        <Button variant="ghost" disabled={action.busy} onClick={() => update(emp.id, { status: 'ACTIVE' })}>Enable</Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
