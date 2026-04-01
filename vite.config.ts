import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: false,
      injectRegister: false,
      includeAssets: ['app-icon.svg', 'noise.svg'],
      workbox: {
        navigateFallback: '/index.html',
        // Avoid workbox/terser parallel minify flakes in sandboxed or low-resource CI
        ...(process.env.CI === 'true' ? { mode: 'development' as const } : {}),
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(api\.fontshare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'scc-fonts',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Increase chunk warning limit slightly (we're optimizing, not ignoring)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Manual chunks for better caching and parallel loading
        manualChunks: {
          // React core — rarely changes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Supabase SDK — large, rarely changes
          'vendor-supabase': ['@supabase/supabase-js'],
          // UI libraries — moderate size
          'vendor-ui': ['framer-motion', 'lucide-react', 'sonner', 'cmdk', 'clsx'],
          // State management
          'vendor-state': ['zustand'],
          // Virtualization — used in large lists
          'vendor-virtual': ['@tanstack/react-virtual'],
          // Recharts — large charting library, used by SearchObservabilityPage
          'vendor-charts': ['recharts'],
        },
      },
    },
  },
});
