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
    `relative flex min-h-9 items-center whitespace-nowrap rounded-lg px-3 text-[14px] transition-colors duration-150 ${
      isActive(href)
        ? 'bg-[var(--brand)]/10 font-semibold text-[var(--brand-strong)] md:before:absolute md:before:inset-y-2 md:before:-left-3 md:before:w-[3px] md:before:rounded-r md:before:bg-[var(--brand)]'
        : 'text-stone-600 hover:bg-stone-200/50 hover:text-stone-900'
    }`;

  return (
    <div className="min-h-screen bg-stone-50 md:flex">
      <aside className="border-b border-stone-200/80 bg-stone-100/70 md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-5 md:pb-5 md:pt-6">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] font-display text-base font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]">
              {title.trim().charAt(0).toUpperCase() || 'X'}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">{product}</p>
              <p className="truncate font-display text-[15px] font-semibold leading-tight text-stone-900">{title}</p>
            </div>
          </div>
          <button onClick={onLogout} className="text-sm text-stone-500 hover:text-stone-900 md:hidden">
            Sign out
          </button>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-2 md:flex-1 md:flex-col md:gap-0.5 md:overflow-y-auto md:pb-4">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass(item.href)} aria-current={isActive(item.href) ? 'page' : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-stone-200/80 px-5 py-4 md:block">
          {headerExtra}
          <p className="truncate text-xs text-stone-500" title={user}>
            {user}
          </p>
          <button onClick={onLogout} className="mt-1 text-sm font-medium text-stone-700 underline-offset-4 hover:text-stone-900 hover:underline">
            Sign out
          </button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
