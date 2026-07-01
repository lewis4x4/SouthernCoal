#!/usr/bin/env node
/**
 * Lane A M1 automated preflight — runs Vitest coverage map, then prints manual A1–A6 reminder.
 * Invoked by `npm run qa:lane-a-m1`.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const vitest = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.lane-a-m1.config.ts'],
  { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (vitest.status !== 0) {
  process.exit(vitest.status ?? 1);
}

console.log('\n--- Lane A M1 manual staging checklist (A1–A6) ---');
console.log('Automated gate passed. Complete manual QA per:');
console.log('  Roadmap/LANE_A_MILESTONE_1_QA.md');
console.log('Preconditions: field user with WV dispatch data, geolocation if testing GPS.');
console.log(
  'Criteria: A1 today\'s route | A2 outcome gates | A3 GPS | A4 online RPC | A5 audit | A6 offline queue\n',
);
