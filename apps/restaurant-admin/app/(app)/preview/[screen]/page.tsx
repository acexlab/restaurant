'use client';

import { Card, PageHeader } from '@xeva/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PREVIEWS } from '../../_screens/preview/registry';

export default function PreviewScreen() {
  const { screen } = useParams<{ screen: string }>();
  const p = PREVIEWS.find((x) => x.key === screen);
  if (!p) {
    return (
      <>
        <PageHeader title="Not found" />
        <Card><Link href="/preview" className="text-sm text-[var(--brand)] hover:underline">All previews</Link></Card>
      </>
    );
  }
  return (
    <>
      <Link href="/preview" className="mb-3 inline-block text-sm text-[var(--brand)] hover:underline">← All previews</Link>
      <p.Screen />
    </>
  );
}
