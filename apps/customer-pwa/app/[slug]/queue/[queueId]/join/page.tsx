'use client';

import { Button, ErrorBanner, Field, Input, useAction } from '@xeva/ui';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { publicApi, useRestaurant } from '../../../restaurant';

/** Remote queue joining from the guest's phone. */
export default function JoinQueue() {
  const { slug, queueId } = useParams<{ slug: string; queueId: string }>();
  const router = useRouter();
  const { restaurant, error, style } = useRestaurant(slug);
  const action = useAction();
  const [form, setForm] = useState({ customerName: '', customerPhone: '', partySize: '2' });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      const { tokenId } = await publicApi<{ tokenId: string }>(slug, `/queues/${queueId}/tokens`, {
        method: 'POST',
        body: { customerName: form.customerName.trim(), customerPhone: form.customerPhone.replace(/\s/g, ''), partySize: Number(form.partySize) },
      });
      router.push(`/${slug}/token/${tokenId}`);
    });
  };

  if (error) return <main className="p-6 text-center text-stone-600">This restaurant page is not available.</main>;

  return (
    <main style={style} className="mx-auto min-h-screen max-w-md px-4 py-8">
      <h1 className="text-2xl font-semibold text-stone-900">{restaurant?.name ?? ' '}</h1>
      {restaurant?.branding?.tagline && <p className="text-stone-500">{restaurant.branding.tagline}</p>}
      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Join the queue</h2>
        <p className="mb-4 text-sm text-stone-500">We&apos;ll give you a token number. Keep this page open to see when it&apos;s your turn.</p>
        <ErrorBanner error={action.error} />
        <form onSubmit={submit} className="space-y-4">
          <Field label="Your name"><Input required autoComplete="name" maxLength={80} value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></Field>
          <Field label="Mobile number" hint="10-digit Indian mobile number">
            <Input required type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="9847012345" value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
          </Field>
          <Field label="Number of guests"><Input required type="number" min={1} max={20} value={form.partySize} onChange={(e) => setForm({ ...form, partySize: e.target.value })} /></Field>
          <Button type="submit" className="min-h-11 w-full text-base" disabled={action.busy}>{action.busy ? 'Joining…' : 'Get my token'}</Button>
        </form>
      </div>
      <p className="mt-4 text-center text-xs text-stone-400">Your number is used only for this visit&apos;s queue.</p>
    </main>
  );
}
