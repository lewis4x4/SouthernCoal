#!/usr/bin/env node
/**
 * Lane A M2 automated preflight — runs Vitest coverage map, then prints manual B1–B5 reminder.
 * Invoked by `npm run qa:lane-a-m2`.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const vitest = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.lane-a-m2.config.ts'],
  { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (vitest.status !== 0) {
  process.exit(vitest.status ?? 1);
}

console.log('\n--- Lane A M2 manual staging checklist (B1–B5) ---');
console.log('Automated gate passed. Complete manual QA per:');
console.log('  Roadmap/LANE_A_MILESTONE_2_QA.md');
console.log('Preconditions: online load first, then offline/airplane mode, audit_log access.');
console.log('Criteria: B1 offline route/visit | B2 sync health | B3 reconnect flush | B4 conflict hold | B5 audit trail\n');
