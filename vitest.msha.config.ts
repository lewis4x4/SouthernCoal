import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/** Focused Vitest config for `npm run qa:msha` — Lane C MSHA pipeline. */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    testTimeout: 15_000,
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/lib/__tests__/mshaViolations.test.ts',
      'src/lib/__tests__/mshaMineMap.test.ts',
      'src/lib/__tests__/mshaPipelineMigration.test.ts',
      'src/lib/__tests__/mshaDiscrepancyRules.test.ts',
      'src/lib/__tests__/externalDataRbac.test.ts',
      'src/components/external-data/__tests__/MshaStatusPanel.test.tsx',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
