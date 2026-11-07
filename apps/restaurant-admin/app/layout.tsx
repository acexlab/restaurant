import { SessionProvider } from '@xeva/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { fontVariables } from './fonts';
import './globals.css';

export const metadata: Metadata = { title: 'Xeva Restaurant Admin' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={fontVariables}>
      <body>
        <SessionProvider storageKey="xeva.restaurant.token">{children}</SessionProvider>
      </body>
    </html>
  );
}
