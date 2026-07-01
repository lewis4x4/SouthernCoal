#!/usr/bin/env node
/**
 * Lane C MSHA automated preflight — parser, mine map, migration tests.
 * Invoked by `npm run qa:msha`.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const vitest = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.msha.config.ts'],
  { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (vitest.status !== 0) {
  process.exit(vitest.status ?? 1);
}

console.log('\n--- Lane C MSHA manual verification ---');
console.log('Automated gate passed. Activate MSHA abatement panel in staging:');
console.log('  1. Confirm migrations 20260701170000 + 20260701180000 applied (106 active mines)');
console.log('  2. Run scripts/seed-msha-uat-violations.sql');
console.log('  3. Open /compliance/external-data as wv-uat-admin@invalid.scc.local');
console.log('  4. MSHA tab — expect 1 overdue + 1 due-soon abatement row');
console.log('  5. Optional: Sync violations (live OGD zip) — admin role only\n');
