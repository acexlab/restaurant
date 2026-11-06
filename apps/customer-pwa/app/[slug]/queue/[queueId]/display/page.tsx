'use client';

import { useLoad } from '@xeva/ui';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { publicApi, useRestaurant } from '../../../restaurant';

interface Display {
  queue: { name: string };
  nowServing: string[];
  upNext: string[];
  waitingCount: number;
  estimatedWaitMinutes: number | null;
  remoteJoining: boolean;
}

/** TV screen for the waiting area (spec 13: full screen, auto refresh, clear states). */
export default function QueueDisplay() {
  const { slug, queueId } = useParams<{ slug: string; queueId: string }>();
  const { restaurant, style } = useRestaurant(slug);
  const d = useLoad(() => publicApi<Display>(slug, `/queues/${queueId}/display`), [slug, queueId]);

  // shortcut: 4 s polling. Replace with a WebSocket subscription once the realtime gateway exists.
  useEffect(() => {
    const id = setInterval(d.reload, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, queueId]);

  if (d.error && !d.data) {
    return <main className="flex min-h-screen items-center justify-center bg-stone-950 text-2xl text-stone-300">This display is not available.</main>;
  }

  const [current, ...alsoCalled] = d.data?.nowServing ?? [];
  return (
    <main style={style} className="flex min-h-screen flex-col bg-stone-950 p-6 text-white md:p-10">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold md:text-4xl">{restaurant?.name}</h1>
        <p className="text-lg text-stone-400 md:text-2xl">{d.data?.queue.name}</p>
      </header>

      <section aria-live="polite" className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <p className="text-xl uppercase tracking-[0.3em] text-stone-400 md:text-3xl">Now serving</p>
        <p className="mt-4 text-8xl font-bold tabular-nums text-[var(--brand)] md:text-[12rem] md:leading-none">{current ?? '—'}</p>
        {alsoCalled.length > 0 && <p className="mt-4 text-2xl text-stone-300 md:text-4xl">Also called: {alsoCalled.join(', ')}</p>}
      </section>

      <footer className="grid gap-6 border-t border-stone-800 pt-6 md:grid-cols-[1fr_auto]">
        <div>
          <p className="text-lg uppercase tracking-widest text-stone-500">Up next</p>
          <p className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-3xl font-semibold tabular-nums md:text-5xl">
            {d.data?.upNext.length ? d.data.upNext.map((l) => <span key={l}>{l}</span>) : <span className="text-stone-600">No one waiting</span>}
          </p>
        </div>
        <div className="text-right text-xl text-stone-400 md:text-2xl">
          <p>{d.data?.waitingCount ?? 0} waiting</p>
          {d.data?.estimatedWaitMinutes != null && <p>About {d.data.estimatedWaitMinutes} min for new guests</p>}
          {/* shortcut: no QR code yet (needs a QR library); guests get the join link from the host. */}
          {d.data?.remoteJoining && <p className="mt-2 text-base text-stone-500">Ask our host for the link to join from your phone.</p>}
        </div>
      </footer>
    </main>
  );
}
