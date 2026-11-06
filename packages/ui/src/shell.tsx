'use client';

import type { ComponentType, ReactNode } from 'react';

export interface NavLink {
  href: string;
  label: string;
}

type LinkLike = ComponentType<{ href: string; className?: string; children: ReactNode; 'aria-current'?: 'page' }>;

/**
 * Admin layout: fixed sidebar on desktop, horizontally scrolling nav on phones.
 * `Link` is the app's router link (next/link) so this package stays framework-free.
 */
export function AppShell({
  product,
  title,
  nav,
  currentPath,
  Link,
  user,
  onLogout,
  headerExtra,
  children,
}: {
  product: string;
  title: string;
  nav: NavLink[];
  currentPath: string;
  Link: LinkLike;
  user: string;
  onLogout: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const isActive = (href: string) => (href === '/' ? currentPath === '/' : currentPath === href || currentPath.startsWith(`${href}/`));
  const linkClass = (href: string) =>
    `block rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
      isActive(href) ? 'bg-[var(--brand)]/10 font-medium text-[var(--brand-strong)]' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
    }`;

  return (
    <div className="min-h-screen bg-stone-50 md:flex">
      <aside className="border-b border-stone-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-3 md:block md:px-5 md:py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--brand)]">{product}</p>
            <p className="truncate text-sm font-semibold text-stone-900">{title}</p>
          </div>
          <button onClick={onLogout} className="text-sm text-stone-500 hover:text-stone-900 md:hidden">
            Sign out
          </button>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-2 md:flex-1 md:flex-col md:overflow-y-auto md:pb-4">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass(item.href)} aria-current={isActive(item.href) ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-stone-100 px-5 py-4 md:block">
          {headerExtra}
          <p className="truncate text-xs text-stone-500" title={user}>
            {user}
          </p>
          <button onClick={onLogout} className="mt-1 text-sm text-stone-600 hover:text-stone-900">
            Sign out
          </button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
