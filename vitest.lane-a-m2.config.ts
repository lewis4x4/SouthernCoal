import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { MILESTONE_2_QA_VITEST_FILES } from './src/lib/milestone2QaMap';

/** Focused Vitest config for `npm run qa:lane-a-m2` — B1–B5 automated gate only. */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    testTimeout: 15_000,
    setupFiles: ['./src/test/setup.ts'],
    include: [...MILESTONE_2_QA_VITEST_FILES],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
