'use client';

import { Button, Card, ErrorBanner, Field, Input, PageHeader, Select, useAction } from '@xeva/ui';
import { useState, type FormEvent } from 'react';
import { useTenant } from '../tenant';

export default function SettingsPage() {
  const { tenant, call, reloadTenant } = useTenant();
  const action = useAction();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    name: tenant.name,
    gstin: tenant.gstin ?? '',
    defaultLocale: tenant.defaultLocale,
    tagline: tenant.branding?.tagline ?? '',
    primaryColor: tenant.branding?.primaryColor ?? '#b4532a',
  });

  const save = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    void action.run(async () => {
      await call(`/tenants/${tenant.id}`, {
        method: 'PATCH',
        body: {
          name: form.name,
          gstin: form.gstin.trim() ? form.gstin.trim().toUpperCase() : null,
          defaultLocale: form.defaultLocale,
          branding: { tagline: form.tagline || undefined, primaryColor: form.primaryColor },
        },
      });
      setSaved(true);
      reloadTenant();
    });
  };

  return (
    <>
      <PageHeader title="Settings" description="Your restaurant's details and how your customer portal looks." />
      <ErrorBanner error={action.error} />
      <form onSubmit={save} className="space-y-4">
        <Card title="Business details">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Restaurant name"><Input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="GSTIN" hint="15 characters, e.g. 32ABCDE1234F1Z5. Leave empty if not registered.">
              <Input value={form.gstin} maxLength={15} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            </Field>
            <Field label="Default language">
              <Select value={form.defaultLocale} onChange={(e) => setForm({ ...form, defaultLocale: e.target.value })}>
                <option value="en">English</option>
                <option value="ml">മലയാളം (Malayalam)</option>
              </Select>
            </Field>
          </div>
        </Card>
        <Card title="Branding">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tagline"><Input maxLength={140} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></Field>
            <Field label="Brand colour" hint="Used on your customer portal and this admin.">
              <div className="flex items-center gap-2">
                <input type="color" aria-label="Brand colour picker" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="h-9 w-12 rounded border border-stone-300" />
                <Input value={form.primaryColor} pattern="^#[0-9a-fA-F]{6}$" onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} />
              </div>
            </Field>
          </div>
        </Card>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={action.busy}>{action.busy ? 'Saving…' : 'Save changes'}</Button>
          {saved && <span role="status" className="text-sm text-emerald-700">Saved.</span>}
        </div>
      </form>
    </>
  );
}
