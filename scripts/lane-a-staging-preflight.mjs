#!/usr/bin/env node
/**
 * Lane A full staging preflight — automated M1+M2 gates, then operator checklist reminder.
 * Invoked by `npm run qa:lane-a-staging`.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function runNpmScript(script) {
  return spawnSync('npm', ['run', script], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

const combined = runNpmScript('qa:lane-a');
if (combined.status !== 0) {
  process.exit(combined.status ?? 1);
}

console.log('\n--- Lane A manual staging sign-off (human tester) ---');
console.log('Checklists:');
console.log('  Roadmap/LANE_A_MILESTONE_1_QA.md  (A1–A6 online field execution)');
console.log('  Roadmap/LANE_A_MILESTONE_2_QA.md  (B1–B5 offline sync)');
console.log('Track pass/fail: /admin/go-live → seed smoke groups lane-a-m1 + lane-a-m2');
console.log('UAT field user (staging): wv-uat-sampler@invalid.scc.local');
console.log('B1 tip: save offline on a date with visits; empty today must not clobber saved cache.');
console.log('Browser QA log: .qa-artifacts/lane-a-staging-browser-20260701.md\n');
