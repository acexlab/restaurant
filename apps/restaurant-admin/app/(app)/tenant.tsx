'use client';

import { Button, ErrorBanner, Loading, useLoad, useSession, type Membership, type RequestOptions } from '@xeva/ui';
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  status: string;
  gstin: string | null;
  defaultLocale: string;
  branding: { primaryColor?: string; tagline?: string; logoUrl?: string };
}

interface NavItem {
  key: string;
  label: string;
  path: string;
}

interface TenantSession {
  tenant: TenantInfo;
  nav: NavItem[];
  /** Nav keys double as a cheap "may I see this?" check for page sections. */
  can: (navKey: string) => boolean;
  /** API call scoped to the selected restaurant. */
  call: <T>(path: string, opts?: Omit<RequestOptions, 'tenantId'>) => Promise<T>;
  reloadTenant: () => void;
  switchTenant: () => void;
}

const Ctx = createContext<TenantSession | null>(null);
const KEY = 'xeva.restaurant.tenant';

export function useTenant() {
  const t = useContext(Ctx);
  if (!t) throw new Error('useTenant outside TenantProvider');
  return t;
}

function readSelected() {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function TenantProvider({ children, render }: { children: ReactNode; render: (t: TenantSession, content: ReactNode) => ReactNode }) {
  const { me, request } = useSession();
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    const stored = readSelected();
    const valid = me.memberships.find((m) => m.tenantId === stored);
    if (valid) setTenantId(valid.tenantId);
    else if (me.memberships.length === 1) setTenantId(me.memberships[0].tenantId);
  }, [me]);

  const choose = (m: Membership | null) => {
    try {
      if (m) sessionStorage.setItem(KEY, m.tenantId);
      else sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setTenantId(m?.tenantId ?? null);
  };

  const loaded = useLoad(
    async () => {
      if (!tenantId) return null;
      const [tenant, nav] = await Promise.all([
        request<TenantInfo>(`/tenants/${tenantId}`, { tenantId }),
        request<NavItem[]>('/me/navigation', { tenantId }),
      ]);
      return { tenant, nav };
    },
    [tenantId, request],
  );

  if (!me) return null;
  if (me.memberships.length === 0) {
    return <Centered>Your account is not part of any restaurant yet. Ask the restaurant owner to add you.</Centered>;
  }
  if (!tenantId) {
    return (
      <Centered>
        <h1 className="mb-4 text-lg font-semibold">Choose a restaurant</h1>
        <ul className="space-y-2">
          {me.memberships.map((m) => (
            <li key={m.tenantId}>
              <Button variant="secondary" className="w-full justify-start" onClick={() => choose(m)}>
                {m.tenantName}
              </Button>
            </li>
          ))}
        </ul>
      </Centered>
    );
  }
  if (loaded.error) {
    return (
      <Centered>
        <ErrorBanner error={loaded.error} />
        <Button variant="secondary" onClick={() => choose(null)}>
          Choose another restaurant
        </Button>
      </Centered>
    );
  }
  if (!loaded.data) return <Loading />;

  const { tenant, nav } = loaded.data;
  const keys = new Set(nav.map((n) => n.key));
  const session: TenantSession = {
    tenant,
    nav,
    can: (k) => keys.has(k),
    call: (path, opts) => request(path, { ...opts, tenantId }),
    reloadTenant: loaded.reload,
    switchTenant: () => choose(null),
  };
  // Restaurant branding drives the admin's accent colour too.
  const color = tenant.branding?.primaryColor;
  const style = color
    ? ({ '--brand': color, '--brand-strong': `color-mix(in srgb, ${color} 82%, black)` } as CSSProperties)
    : undefined;

  return (
    <Ctx.Provider value={session}>
      <div style={style}>{render(session, children)}</div>
    </Ctx.Provider>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-700">{children}</div>
    </main>
  );
}
