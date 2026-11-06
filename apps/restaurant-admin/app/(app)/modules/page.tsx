'use client';

import { ApiError, Badge, Button, Card, ErrorBanner, humanize, Loading, PageHeader, Toggle, useAction, useLoad } from '@xeva/ui';
import { useTenant } from '../tenant';

interface CatalogModule {
  id: string;
  name: string;
  description: string;
  category: string;
  availability: string;
  definition: { features: { key: string; name: string }[] };
}
interface Installed { moduleId: string; status: string; features: Record<string, boolean> }

export default function ModulesPage() {
  const { tenant, call, reloadTenant } = useTenant();
  const action = useAction();
  const { data, error, reload } = useLoad(async () => {
    const [catalog, installed] = await Promise.all([
      call<CatalogModule[]>('/modules'),
      call<Installed[]>(`/tenants/${tenant.id}/modules`),
    ]);
    const byId = new Map(installed.map((i) => [i.moduleId, i]));
    // Installed first, then what can be activated today, then coming-soon products.
    const rank = (m: CatalogModule) => (byId.get(m.id)?.status === 'ACTIVE' ? 0 : byId.has(m.id) ? 1 : m.availability === 'planned' ? 3 : 2);
    return { catalog: [...catalog].sort((a, b) => rank(a) - rank(b)), installed: byId };
  }, [tenant.id]);

  const done = async (fn: () => Promise<unknown>) => {
    await action.run(fn);
    reload();
    reloadTenant(); // navigation depends on active modules
  };

  const activate = (id: string) => done(() => call(`/tenants/${tenant.id}/modules`, { method: 'POST', body: { moduleId: id } }));
  const deactivate = (m: CatalogModule) => {
    if (!confirm(`Deactivate ${m.name}? Its data and settings are kept and come back if you reactivate it.`)) return;
    void done(() => call(`/tenants/${tenant.id}/modules/${m.id}`, { method: 'PATCH', body: { status: 'INACTIVE' } }));
  };
  const setFeature = (id: string, key: string, value: boolean) =>
    done(() => call(`/tenants/${tenant.id}/modules/${id}`, { method: 'PATCH', body: { features: { [key]: value } } }));

  const errorText =
    action.error instanceof ApiError && action.error.code === 'MODULE_NOT_IN_PLAN'
      ? new Error(`${action.error.message}. Contact Xeva to add it to your plan.`)
      : action.error;

  return (
    <>
      <PageHeader title="Product Modules" description="Each product works on its own. Activate only what your restaurant needs, and switch individual features on or off." />
      <ErrorBanner error={error ?? errorText} />
      {!data ? (
        <Loading />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.catalog.map((m) => {
            const inst = data.installed.get(m.id);
            const active = inst?.status === 'ACTIVE';
            return (
              <Card
                key={m.id}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {m.name}
                    {inst ? <Badge>{inst.status}</Badge> : <Badge tone="gray">not installed</Badge>}
                    {m.availability !== 'available' && <Badge tone={m.availability === 'beta' ? 'blue' : 'gray'}>{m.availability}</Badge>}
                  </span>
                }
              >
                <p className="text-sm text-stone-600">{m.description}</p>
                <p className="mt-1 text-xs text-stone-400">{humanize(m.category)}</p>

                {active && (
                  <ul className="mt-4 space-y-2 border-t border-stone-100 pt-3">
                    {m.definition.features.map((f) => (
                      <li key={f.key} className="flex items-center justify-between gap-3 text-sm">
                        <span>{f.name}</span>
                        <Toggle label={f.name} checked={!!inst.features[f.key]} disabled={action.busy} onChange={(v) => setFeature(m.id, f.key, v)} />
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-4 flex gap-2">
                  {active ? (
                    <Button variant="danger" disabled={action.busy} onClick={() => deactivate(m)}>Deactivate</Button>
                  ) : m.availability === 'planned' ? (
                    <span className="text-sm text-stone-500">Coming soon</span>
                  ) : (
                    <Button disabled={action.busy} onClick={() => activate(m.id)}>{inst ? 'Reactivate' : 'Activate'}</Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
