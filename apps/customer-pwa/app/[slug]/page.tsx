'use client';

import { useLoad } from '@xeva/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { publicApi, useRestaurant } from './restaurant';

interface PublicQueue { id: string; name: string; waitingCount: number; canJoin: boolean; hasDisplay: boolean }

/** Restaurant home page (spec 4.1). Shows what the restaurant has switched on; today that is the queue. */
export default function RestaurantHome() {
  const { slug } = useParams<{ slug: string }>();
  const { restaurant, error, style } = useRestaurant(slug);
  // 404 here just means Digital Token is not active: the page still shows the restaurant.
  const queues = useLoad(() => publicApi<PublicQueue[]>(slug, '/queues').catch(() => []), [slug]);

  if (error) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-stone-700">We couldn&apos;t find a restaurant at this address.</p>
        <Link href="/" className="mt-3 inline-block text-sm text-[var(--brand)] hover:underline">Try another address</Link>
      </main>
    );
  }

  return (
    <main style={style} className="mx-auto min-h-screen max-w-md px-4 py-8">
      <h1 className="text-2xl font-semibold text-stone-900">{restaurant?.name ?? ' '}</h1>
      {restaurant?.branding?.tagline && <p className="text-stone-500">{restaurant.branding.tagline}</p>}

      <Link href={`/${slug}/menu`} className="mt-6 flex min-h-11 items-center justify-center rounded-md border border-stone-300 bg-white font-medium text-stone-800 hover:bg-stone-50">
        View menu
      </Link>

      <section className="mt-6 space-y-3">
        {queues.data?.length === 0 && <p className="text-sm text-stone-500">Nothing to do online here yet. Please speak to our staff.</p>}
        {queues.data?.map((q) => (
          <div key={q.id} className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold text-stone-900">{q.name}</h2>
              <span className="text-sm text-stone-500">{q.waitingCount} waiting</span>
            </div>
            <div className="mt-3 flex gap-2">
              {q.canJoin ? (
                <Link href={`/${slug}/queue/${q.id}/join`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-[var(--brand)] px-4 font-medium text-white hover:bg-[var(--brand-strong)]">
                  Join the queue
                </Link>
              ) : (
                <p className="flex-1 text-sm text-stone-500">Get a token from our host at the entrance.</p>
              )}
              {q.hasDisplay && (
                <Link href={`/${slug}/queue/${q.id}/display`} className="inline-flex min-h-11 items-center justify-center rounded-md border border-stone-300 px-4 text-sm text-stone-700 hover:bg-stone-50">
                  Live board
                </Link>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Coming soon</h2>
        <ul className="mt-2 grid grid-cols-2 gap-2">
          {[['reserve', 'Book a table'], ['account', 'My rewards'], ['feedback', 'Rate your visit'], ['delivery', 'Track a delivery']].map(([k, l]) => (
            <li key={k}>
              <Link href={`/${slug}/preview/${k}`} className="flex min-h-11 items-center justify-center rounded-md border border-dashed border-stone-300 px-2 text-center text-sm text-stone-600 hover:bg-white">{l}</Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
