import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/** Focused Vitest config for `npm run qa:qw3` — Lane C QW3 defensible-miss packets. */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    testTimeout: 15_000,
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/lib/__tests__/defensibleMiss.test.ts',
      'src/lib/__tests__/defensibleMissMigration.test.ts',
      'src/lib/__tests__/defensibleMissStorageMigration.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
