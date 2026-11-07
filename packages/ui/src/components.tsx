'use client';

import { useState, type ButtonHTMLAttributes, type FormEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ApiError } from './api';
import { useSession } from './session';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex min-h-9 select-none items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium',
        // Feedback on pointer-down (:active), not on release.
        'transition-[background-color,box-shadow,translate,scale,color] duration-150 ease-out active:scale-[0.97] active:duration-100',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' && 'bg-[var(--brand)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(30_25_21/0.2)] hover:-translate-y-px hover:bg-[var(--brand-strong)] hover:shadow-lift',
        variant === 'secondary' && 'border border-stone-300 bg-white text-stone-800 shadow-card hover:-translate-y-px hover:border-stone-400 hover:shadow-lift',
        variant === 'danger' && 'border border-red-200 bg-white text-red-700 hover:-translate-y-px hover:bg-red-50',
        variant === 'ghost' && 'text-stone-600 hover:bg-stone-200/60 hover:text-stone-900',
        className,
      )}
    />
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-stone-200/80 bg-white shadow-card transition-[transform,box-shadow] duration-200 [a:hover>&]:-translate-y-0.5 [a:hover>&]:shadow-lift', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
          <h2 className="font-display text-[15px] font-semibold text-stone-900">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.025em] text-stone-900">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-stone-500">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-600/15 before:bg-emerald-500',
  amber: 'bg-amber-50 text-amber-900 ring-amber-600/15 before:bg-amber-500',
  red: 'bg-red-50 text-red-800 ring-red-600/15 before:bg-red-500',
  blue: 'bg-sky-50 text-sky-800 ring-sky-600/15 before:bg-sky-500',
  gray: 'bg-stone-100 text-stone-600 ring-stone-500/15 before:bg-stone-400',
};

/** Maps the platform's status enums to a colour. */
export function statusTone(status: string): keyof typeof TONES {
  if (['ACTIVE', 'SUCCEEDED', 'available'].includes(status)) return 'green';
  if (['TRIAL', 'PENDING', 'PROVISIONING', 'PURCHASED', 'beta', 'GRACE', 'ONBOARDING', 'INVITED'].includes(status)) return 'blue';
  if (['SUSPENDED', 'FAILED', 'PAST_DUE', 'DEACTIVATION_PENDING'].includes(status)) return 'amber';
  if (['DEAD_LETTER', 'CANCELLED', 'CLOSED', 'DISABLED', 'ERROR'].includes(status)) return 'red';
  return 'gray';
}

export function Badge({ children, tone }: { children: ReactNode; tone?: keyof typeof TONES }) {
  const t = tone ?? (typeof children === 'string' ? statusTone(children) : 'gray');
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize whitespace-nowrap ring-1 ring-inset before:h-1.5 before:w-1.5 before:rounded-full before:content-['']", TONES[t])}>
      {typeof children === 'string' ? children.replace(/_/g, ' ').toLowerCase() : children}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

const inputClass =
  'block min-h-10 w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-[15px] text-stone-900 shadow-[inset_0_1px_1px_rgb(30_25_21/0.03)] transition-[border-color,box-shadow] placeholder:text-stone-400 hover:border-stone-400 focus:border-[var(--brand)] focus:outline-none focus:ring-4 focus:ring-[var(--brand)]/12';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputClass, props.className)} />;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] disabled:opacity-50',
        checked ? 'bg-[var(--brand)]' : 'bg-stone-300',
      )}
    >
      <span className={cx('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  );
}

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof ApiError ? error.code : null;
  return (
    <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
      {code && <span className="ml-2 font-mono text-xs text-red-600">{code}</span>}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{children}</div>;
}

export function Loading() {
  return <p className="py-8 text-center text-sm text-stone-500">Loading…</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-stone-500">{children}</p>;
}

/** Table that scrolls horizontally inside its card on narrow screens. */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">
            {head.map((h) => (
              <th key={h} className="px-5 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={cx('px-5 py-2.5 align-top text-stone-700', className)}>{children}</td>
);

/** Run an async action with a busy flag and captured error. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

export function LoginForm({ title, subtitle, onSuccess }: { title: string; subtitle: string; onSuccess?: () => void }) {
  const { login } = useSession();
  const { busy, error, run } = useAction();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await login(email, password);
      onSuccess?.();
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-stone-200/80 bg-white p-7 shadow-lift">
        <p className="mb-6 flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-stone-900">
          <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand)] text-sm text-white">X</span>Xeva
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-stone-900">{title}</h1>
        <p className="mb-6 mt-1 text-[15px] text-stone-500">{subtitle}</p>
        <ErrorBanner error={error} />
        <div className="space-y-4">
          <Field label="Email">
            <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </form>
    </main>
  );
}

/** Shows a one-time secret (e.g. a temporary password) that the server will not return again. */
export function SecretNotice({ label, value, onDismiss }: { label: string; value: string; onDismiss: () => void }) {
  return (
    <Notice>
      <p className="font-medium">{label}</p>
      <p className="mt-1">
        Share it securely. It is shown only once: <code className="rounded bg-white px-1.5 py-0.5 font-mono">{value}</code>
      </p>
      <Button variant="secondary" className="mt-2" onClick={onDismiss}>
        I have saved it
      </Button>
    </Notice>
  );
}
