#!/usr/bin/env node
/**
 * Roadmap §7.2 schema discipline automated preflight.
 * Invoked by `npm run qa:schema-72`.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const vitest = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.schema-72.config.ts'],
  { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (vitest.status !== 0) {
  process.exit(vitest.status ?? 1);
}

console.log('\n--- Roadmap §7.2 schema discipline manual verification ---');
console.log('Automated gate passed. Smoke in staging after applying 20260702200000:');
console.log('  1. Run gap detection — each new gap has work_order_id populated');
console.log('  2. Open /compliance/penalty-ledger — sources show citation + verification_status');
console.log('  3. Confirm penalty_exposure_lines rows in DB for org\n');
