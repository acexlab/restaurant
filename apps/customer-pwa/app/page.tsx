'use client';

import { Button, Field, Input } from '@xeva/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

/** Customers normally arrive on a restaurant's own link or QR code; this page finds one by its address. */
export default function Home() {
  const router = useRouter();
  const [slug, setSlug] = useState('');
  const go = (e: FormEvent) => {
    e.preventDefault();
    const s = slug.trim().toLowerCase().replace(/\.xeva\.in.*$/, '');
    if (s) router.push(`/${encodeURIComponent(s)}`);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wider text-[var(--brand)]">Xeva</p>
      <h1 className="mt-1 text-2xl font-semibold text-stone-900">Find your restaurant</h1>
      <p className="mt-2 text-sm text-stone-500">Scan the QR code at the restaurant, or type its Xeva address.</p>
      <form onSubmit={go} className="mt-6 space-y-3">
        <Field label="Restaurant address" hint="For example: cochin-chai-corner">
          <Input required autoCapitalize="none" autoCorrect="off" value={slug} onChange={(e) => setSlug(e.target.value)} />
        </Field>
        <Button type="submit" className="min-h-11 w-full text-base">Open</Button>
      </form>
    </main>
  );
}
