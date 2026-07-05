#!/usr/bin/env node
/**
 * Lane C QW1 automated preflight — migration + severity tests, manual seed reminder.
 * Invoked by `npm run qa:qw1`.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const vitest = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.qw1.config.ts'],
  { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (vitest.status !== 0) {
  process.exit(vitest.status ?? 1);
}

console.log('\n--- Lane C QW1 manual verification ---');
console.log('Automated gate passed. Activate detector in staging:');
console.log('  1. Before seeding, open /compliance/missed-at-risk — expect Not configured readiness');
console.log('  2. Run scripts/seed-qw1-uat-calendar.sql (after seed-lane-a-wv-uat.sql)');
console.log('  3. Reopen /compliance/missed-at-risk as wv-uat-admin@invalid.scc.local — expect Draft calendar readiness');
console.log('  4. Click Run gap detection — expect 1 missed + 1 at-risk (excused row excluded)');
console.log('  5. Verify both opened gaps have work_order_id and start/complete audit rows');
console.log('  6. Re-run detection — expect no duplicate open gap for the same calendar row');
console.log('  7. Resolve one gap by lab result or documented excuse — expect valid_to + closed work order event');
console.log('  8. Nightly cron: detect-sampling-calendar-gaps-nightly @ 06:00 UTC\n');
