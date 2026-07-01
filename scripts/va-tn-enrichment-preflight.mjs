#!/usr/bin/env node
/**
 * Lane C VA/TN enrichment preflight — outfall + parameter DB resolution tests.
 * Invoked by `npm run qa:va-tn-enrichment`.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const vitest = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.va-tn-enrichment.config.ts'],
  { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (vitest.status !== 0) {
  process.exit(vitest.status ?? 1);
}

console.log('\n--- Lane C VA/TN enrichment manual verification ---');
console.log('Automated gate passed. Staging import loop:');
console.log('  1. Ensure scripts/seed-lane-a-wv-uat.sql applied');
console.log('  2. Upload VA CSV or TN OSMRE workbook with permit WV-UAT-FAKE-001, outfall 001, pH/TSS');
console.log('  3. Parse → confirm outfalls_resolved + parameters_resolved > 0 in preview');
console.log('  4. Import → sampling_events + lab_results rows created\n');
