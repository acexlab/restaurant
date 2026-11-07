'use client';

import { useParams } from 'next/navigation';
import { MenuView } from '../menu-view';

/** Browse-only menu (no table): works with QR Menu alone. */
export default function MenuPage() {
  const { slug } = useParams<{ slug: string }>();
  return <MenuView slug={slug} />;
}
