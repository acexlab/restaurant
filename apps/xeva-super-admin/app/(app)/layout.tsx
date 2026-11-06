'use client';

import { AppShell, Button, Loading, useSession } from '@xeva/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

const NAV = [
  { href: '/', label: 'Platform Overview' },
  { href: '/restaurants', label: 'Restaurants' },
  { href: '/catalogue', label: 'Product Catalogue' },
  { href: '/plans', label: 'Subscription Plans' },
  { href: '/integrations', label: 'Integration Monitoring' },
  { href: '/audit', label: 'Audit Logs' },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { me, loading, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !me) router.replace('/login');
  }, [loading, me, router]);

  if (loading || !me) return <Loading />;
  // The API enforces this too; the check here only avoids showing an empty shell.
  if (!me.isPlatformAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-sm rounded-lg border border-stone-200 bg-white p-6 text-sm">
          <p className="mb-4">{me.email} is not a Xeva administrator.</p>
          <Button variant="secondary" onClick={logout}>Sign out</Button>
        </div>
      </main>
    );
  }

  return (
    <AppShell product="Xeva" title="Super Admin" nav={NAV} currentPath={pathname} Link={Link} user={me.email} onLogout={logout}>
      {children}
    </AppShell>
  );
}
