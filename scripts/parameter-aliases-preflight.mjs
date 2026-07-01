#!/usr/bin/env node
/**
 * Task 2.64 — parameter alias harness (parser map + migration contract).
 * Optional live DB check when SUPABASE_SERVICE_ROLE_KEY is set.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const vitest = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.parameter-aliases.config.ts'],
  { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (vitest.status !== 0) {
  process.exit(vitest.status ?? 1);
}

function loadEnvLocal() {
  const envPath = resolve(REPO_ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.VITE_SUPABASE_URL) {
  const db = spawnSync('node', ['scripts/validate-parameter-aliases.mjs'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (db.status !== 0) {
    process.exit(db.status ?? 1);
  }
} else {
  console.log('\n--- Skipping live DB validate:parameter-aliases (no service role key) ---');
}

console.log('\n--- Task 2.64 manual verification ---');
console.log('  1. Apply migration 20260702190000');
console.log('  2. Open /compliance/aliases — STORET coverage panel at top');
console.log('  3. Harness should show Pass when aliases ≥ 50 and all STORET codes present\n');
