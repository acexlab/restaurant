import { Bricolage_Grotesque, Figtree } from 'next/font/google';

// Xeva type pairing (see packages/ui/src/theme.css): display + text.
const head = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-head', display: 'swap' });
const body = Figtree({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const fontVariables = `${head.variable} ${body.variable}`;
