import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/** Focused Vitest config for `npm run qa:va-tn-enrichment` — Lane C VA/TN/AL import resolution. */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    testTimeout: 15_000,
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/lib/__tests__/labRecordEnrichment.test.ts',
      'src/lib/__tests__/vaLabFixedWidth.test.ts',
      'src/lib/__tests__/osmreMonitoringParse.test.ts',
      'src/lib/__tests__/alLabParse.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
