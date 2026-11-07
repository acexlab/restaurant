'use client';

import { useParams } from 'next/navigation';
import { MenuView } from '../../menu-view';

/** Landing page of a table's QR code: menu, ordering and service requests. */
export default function TablePage() {
  const { slug, qrToken } = useParams<{ slug: string; qrToken: string }>();
  return <MenuView slug={slug} qrToken={qrToken} />;
}
