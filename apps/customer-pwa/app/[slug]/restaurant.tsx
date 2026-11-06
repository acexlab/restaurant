'use client';

import { apiRequest, useLoad } from '@xeva/ui';
import type { CSSProperties } from 'react';

export interface PublicRestaurant {
  name: string;
  slug: string;
  branding: { primaryColor?: string; tagline?: string };
}

/** Public API call (no login). */
export const publicApi = <T,>(slug: string, path: string, opts?: { method?: 'POST'; body?: unknown }) =>
  apiRequest<T>(null, `/public/restaurants/${encodeURIComponent(slug)}${path}`, opts);

/** The restaurant's name and brand colour for its customer-facing pages. */
export function useRestaurant(slug: string) {
  const r = useLoad(() => publicApi<PublicRestaurant>(slug, ''), [slug]);
  const color = r.data?.branding?.primaryColor;
  const style = color ? ({ '--brand': color, '--brand-strong': `color-mix(in srgb, ${color} 82%, black)` } as CSSProperties) : undefined;
  return { restaurant: r.data, error: r.error, style };
}
