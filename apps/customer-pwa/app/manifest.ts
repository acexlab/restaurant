import type { MetadataRoute } from 'next';

// shortcut: one generic manifest; per-restaurant name/colour/icons come with branded domains (spec 4.1).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Xeva',
    short_name: 'Xeva',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafaf9',
    theme_color: '#b4532a',
    icons: [],
  };
}
