'use client';

import { ErrorBanner, useLoad } from '@xeva/ui';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { publicApi, useRestaurant } from '../../restaurant';

interface Tracking {
  label: string;
  status: 'WAITING' | 'CALLED' | 'COMPLETED' | 'SKIPPED' | 'CANCELLED';
  queueName: string;
  ahead: number;
  estimatedWaitMinutes: number | null;
  nowServing: string | null;
}

const MESSAGE: Record<Tracking['status'], string> = {
  WAITING: 'You are in the queue.',
  CALLED: 'It’s your turn! Please come to the counter.',
  COMPLETED: 'Enjoy your meal!',
  SKIPPED: 'We called your number but missed you. Please speak to the host.',
  CANCELLED: 'This token was cancelled.',
};

/** The guest's own token: live position and wait. */
export default function TrackToken() {
  const { slug, tokenId } = useParams<{ slug: string; tokenId: string }>();
  const { restaurant, style } = useRestaurant(slug);
  const t = useLoad(() => publicApi<Tracking>(slug, `/tokens/${tokenId}`), [slug, tokenId]);

  // shortcut: 10 s polling; push notifications come with the notification service.
  useEffect(() => {
    const id = setInterval(t.reload, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, tokenId]);

  const d = t.data;
  return (
    <main style={style} className="mx-auto min-h-screen max-w-md px-4 py-8 text-center">
      <p className="text-sm text-stone-500">{restaurant?.name}</p>
      {t.error && !d ? (
        <ErrorBanner error={new Error('We could not find this token.')} />
      ) : d ? (
        <>
          <p className="mt-6 text-sm uppercase tracking-widest text-stone-500">Your token</p>
          <p className={`mt-2 text-7xl font-bold tabular-nums ${d.status === 'CALLED' ? 'text-[var(--brand)]' : 'text-stone-900'}`}>{d.label}</p>
          <p aria-live="polite" className={`mt-4 text-lg ${d.status === 'CALLED' ? 'font-semibold text-[var(--brand)]' : 'text-stone-700'}`}>{MESSAGE[d.status]}</p>

          {d.status === 'WAITING' && (
            <dl className="mt-8 grid grid-cols-2 gap-3 text-left">
              <div className="rounded-xl border border-stone-200 bg-white p-4">
                <dt className="text-sm text-stone-500">Ahead of you</dt>
                <dd className="text-3xl font-semibold tabular-nums">{d.ahead}</dd>
              </div>
              <div className="rounded-xl border border-stone-200 bg-white p-4">
                <dt className="text-sm text-stone-500">Estimated wait</dt>
                <dd className="text-3xl font-semibold tabular-nums">{d.estimatedWaitMinutes != null ? `${d.estimatedWaitMinutes} min` : '—'}</dd>
              </div>
            </dl>
          )}
          <p className="mt-6 text-sm text-stone-500">
            {d.queueName}
            {d.nowServing ? ` · now serving ${d.nowServing}` : ''}
          </p>
          <p className="mt-2 text-xs text-stone-400">This page updates by itself. Bookmark it to check back.</p>
        </>
      ) : (
        <p className="mt-10 text-stone-500">Loading…</p>
      )}
    </main>
  );
}
