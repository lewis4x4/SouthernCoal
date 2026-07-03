#!/usr/bin/env node
/**
 * Slice 1 — full activation chain: limits → exceedances → repair → reconcile → gaps report.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function run(script, args = []) {
  const res = spawnSync('node', [resolve(REPO_ROOT, 'scripts', script), ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

run('slice1-seed-permit-limits.mjs', ['--limit', '50', '--batches', '8']);
run('slice1-seed-propagated-limits.mjs', ['--permit', 'KYGE40869', '--limit', '100', '--batches', '3']);
run('slice1-seed-exceedances.mjs', ['--limit', '250', '--batches', '10']);
run('slice1-repair-stuck-keys.mjs', ['--limit', '100']);
run('slice1-reconcile.mjs', ['--limit', '10000', '--batches', '10']);
run('slice1-activation-gaps.mjs');
