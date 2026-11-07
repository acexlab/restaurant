'use client';

import { Button, Field, Input, Select } from '@xeva/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useRestaurant } from '../../restaurant';

const CUSTOMER_PREVIEWS = [
  { key: 'reserve', label: 'Book a table', phase: 2 },
  { key: 'account', label: 'My rewards', phase: 2 },
  { key: 'feedback', label: 'Rate your visit', phase: 2 },
  { key: 'delivery', label: 'Track a delivery', phase: 5 },
];

function Banner({ phase }: { phase: number }) {
  return (
    <p role="note" className="mb-4 rounded-md border border-dashed border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900">
      <b>Preview · Phase {phase}.</b> Sample screen, nothing is sent yet.
    </p>
  );
}

function Reserve() {
  const [done, setDone] = useState<string | null>(null);
  const [f, setF] = useState({ date: 'Today', time: '19:30', guests: '2', name: '', phone: '' });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setDone(`${f.guests} guests · ${f.date} at ${f.time}`);
  };
  if (done) return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center"><p className="text-lg font-semibold text-emerald-900">Table booked</p><p className="mt-1 text-emerald-800">{done}</p><p className="mt-3 text-sm text-emerald-800">We’ll send a reminder 2 hours before.</p></div>;
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Day"><Select value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}><option>Today</option><option>Tomorrow</option><option>Saturday</option></Select></Field>
        <Field label="Guests"><Input type="number" min={1} max={12} value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })} /></Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-stone-700">Time</legend>
        <div className="grid grid-cols-4 gap-2">
          {['12:30', '13:00', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'].map((t) => (
            <button type="button" key={t} onClick={() => setF({ ...f, time: t })} disabled={t === '20:00'} aria-pressed={f.time === t}
              className={`min-h-11 rounded-md border text-sm ${f.time === t ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-stone-300'} disabled:opacity-40`}>{t}</button>
          ))}
        </div>
      </fieldset>
      <Field label="Your name"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Mobile number" hint="We’ll send an OTP to confirm"><Input required type="tel" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      <Button type="submit" className="min-h-12 w-full text-base">Book table</Button>
    </form>
  );
}

function Account() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[var(--brand)] p-5 text-white">
        <p className="text-sm opacity-80">Gold member</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">920 pts</p>
        <p className="mt-1 text-sm opacity-80">= ₹92 off your next bill · 80 pts to a free Pazhampori</p>
      </div>
      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Recent visits</h2>
        <ul className="mt-2 divide-y divide-stone-100 text-sm">
          {[['2 Nov', 'Biryani (Full), 2× Parotta', '₹325', '+16'], ['24 Oct', 'Beef Ularthiyathu, Sulaimani', '₹284', '+14']].map(([d, w, a, p]) => (
            <li key={d} className="flex justify-between gap-3 py-2"><span><b>{d}</b> · {w}</span><span className="shrink-0 tabular-nums">{a} <span className="text-emerald-700">{p}</span></span></li>
          ))}
        </ul>
      </section>
      <label className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4 text-sm">
        Offers on WhatsApp <input type="checkbox" defaultChecked className="h-5 w-5" />
      </label>
    </div>
  );
}

function FeedbackForm() {
  const [stars, setStars] = useState(0);
  const [sent, setSent] = useState(false);
  if (sent) return <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center text-emerald-900">Thank you! You earned 20 points.</p>;
  return (
    <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
      <p className="font-medium">How was your meal?</p>
      <div role="radiogroup" aria-label="Rating" className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setStars(n)} className={`text-4xl ${n <= stars ? 'text-amber-500' : 'text-stone-300'}`}>★</button>
        ))}
      </div>
      <Field label="Anything to tell us? (optional)"><Input maxLength={300} /></Field>
      <Button className="min-h-12 w-full" disabled={!stars} onClick={() => setSent(true)}>Send</Button>
    </div>
  );
}

function DeliveryTrack() {
  const steps = ['Order confirmed', 'Preparing', 'Picked up by Ajmal', 'Arriving'];
  return (
    <div className="space-y-4">
      <div className="flex aspect-video items-center justify-center rounded-xl bg-stone-200 text-sm text-stone-500" aria-label="Map placeholder">Live map · rider 1.2 km away</div>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-3">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${i <= 2 ? 'bg-[var(--brand)] text-white' : 'bg-stone-200 text-stone-500'}`}>{i < 2 ? '✓' : i + 1}</span>
            <span className={i === 2 ? 'font-semibold' : i < 2 ? 'text-stone-700' : 'text-stone-400'}>{s}</span>
          </li>
        ))}
      </ol>
      <p className="text-center text-lg font-semibold">Arriving in about 9 min</p>
      <a href="tel:+910000000000" className="flex min-h-11 items-center justify-center rounded-md border border-stone-300 bg-white text-sm">Call rider</a>
    </div>
  );
}

const SCREENS: Record<string, () => ReactNode> = { reserve: Reserve, account: Account, feedback: FeedbackForm, delivery: DeliveryTrack };

export default function CustomerPreview() {
  const { slug, screen } = useParams<{ slug: string; screen: string }>();
  const { restaurant, style } = useRestaurant(slug);
  const meta = CUSTOMER_PREVIEWS.find((p) => p.key === screen);
  const Screen = SCREENS[screen];
  return (
    <main style={style} className="mx-auto min-h-screen max-w-md px-4 py-6">
      <Link href={`/${slug}`} className="text-sm text-[var(--brand)] hover:underline">← {restaurant?.name ?? 'Back'}</Link>
      <h1 className="mb-4 mt-2 text-2xl font-semibold">{meta?.label ?? 'Not found'}</h1>
      {meta && Screen ? <><Banner phase={meta.phase} /><Screen /></> : <p className="text-stone-500">This page does not exist.</p>}
    </main>
  );
}
