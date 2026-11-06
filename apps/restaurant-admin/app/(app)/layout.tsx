'use client';

import { AppShell, Loading, useSession } from '@xeva/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { TenantProvider } from './tenant';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { me, loading, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !me) router.replace('/login');
  }, [loading, me, router]);

  if (loading || !me) return <Loading />;

  return (
    <TenantProvider
      render={(t, content) => (
        <AppShell
          product="Xeva"
          title={t.tenant.name}
          nav={t.nav.map((n) => ({ href: n.path, label: n.label }))}
          currentPath={pathname}
          Link={Link}
          user={me.email}
          onLogout={logout}
          headerExtra={
            me.memberships.length > 1 ? (
              <button onClick={t.switchTenant} className="mb-2 block text-xs font-medium text-[var(--brand)] hover:underline">
                Switch restaurant
              </button>
            ) : null
          }
        >
          {content}
        </AppShell>
      )}
    >
      {children}
    </TenantProvider>
  );
}
