import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ZLAQA Team OS',
    short_name: 'ZLAQA OS',
    description: 'Tasks, attendance, OKRs, calendar and team communication for ZLAQA AI',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#111111',
    theme_color: '#111111',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/logo-black.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
