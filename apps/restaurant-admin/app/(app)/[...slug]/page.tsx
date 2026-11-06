'use client';

import { Card, PageHeader } from '@xeva/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTenant } from '../tenant';

/** Screens for operational modules (Orders, Kitchen, POS…) arrive with each module in Phase 1. */
export default function ModuleScreenPlaceholder() {
  const { slug } = useParams<{ slug: string[] }>();
  const { nav } = useTenant();
  const item = nav.find((n) => n.path === `/${slug.join('/')}`);

  return (
    <>
      <PageHeader title={item?.label ?? 'Not found'} />
      <Card>
        <p className="text-sm text-stone-600">
          {item
            ? `The ${item.label} screens are part of the module rollout and are not built yet. The product is active for your restaurant.`
            : 'This page does not exist or you do not have access to it.'}
        </p>
        <Link href="/" className="mt-3 inline-block text-sm text-[var(--brand)] hover:underline">Back to overview</Link>
      </Card>
    </>
  );
}
