import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Ledger — Personal Finance',
        short_name: 'Ledger',
        description: 'Track spending, budgets, bills and goals.',
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['finance', 'productivity'],
        screenshots: [
          { src: 'screenshot-mobile.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Overview' },
          { src: 'screenshot-wide.png', sizes: '1440x900', type: 'image/png', form_factor: 'wide', label: 'Overview on desktop' },
        ],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Screenshots are only for the install sheet; keep them out of the offline cache.
        globIgnores: ['**/screenshot-*.png'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth') && !url.pathname.startsWith('/api/data'),
            handler: 'NetworkFirst',
            method: 'GET',
            options: { cacheName: 'api', networkTimeoutSeconds: 4, expiration: { maxEntries: 100, maxAgeSeconds: 86400 } },
          },
        ],
      },
    }),
  ],
  server: { port: 5173, proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes('node_modules/recharts') || id.includes('node_modules/d3-') ? 'charts'
          : /node_modules\/(react|react-dom|react-router|react-router-dom|@tanstack|scheduler)\//.test(id) ? 'vendor'
          : undefined,
      },
    },
  },
});
