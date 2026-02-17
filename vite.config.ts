import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
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
