import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { fontVariables } from './fonts';
import './globals.css';

export const metadata: Metadata = { title: 'Xeva', description: 'Restaurant queue, menu and ordering' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#b4532a' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
