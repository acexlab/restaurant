'use client';

import { Card, PageHeader } from '@xeva/ui';
import Link from 'next/link';
import { PREVIEWS } from '../_screens/preview/registry';

const PHASES: Record<number, string> = {
  2: 'Customer experience',
  3: 'Business operations',
  4: 'SaaS growth',
  5: 'Expansion',
};

/** Index of prototype screens for the phases still to be built. */
export default function PreviewIndex() {
  return (
    <>
      <PageHeader title="Roadmap previews" description="Clickable prototypes of every product still to come, with sample data. They become real as each phase is built." />
      <div className="space-y-6">
        {Object.entries(PHASES).map(([phase, title]) => (
          <section key={phase}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Phase {phase} · {title}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PREVIEWS.filter((p) => p.phase === Number(phase)).map((p) => (
                <Link key={p.key} href={`/preview/${p.key}`} className="block">
                  <Card className="h-full transition-colors hover:border-[var(--brand)]"><p className="font-medium text-stone-900">{p.label}</p></Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
