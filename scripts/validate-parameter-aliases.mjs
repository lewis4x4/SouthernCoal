#!/usr/bin/env node
/**
 * Task 2.64 — read-only DB report: parameter_aliases vs parameters (STORET coverage).
 *
 * Usage:
 *   node scripts/validate-parameter-aliases.mjs
 *   node scripts/validate-parameter-aliases.mjs --json
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

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

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jsonOut = process.argv.includes('--json');

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const [{ data: parameters, error: paramError }, { data: aliases, error: aliasError }] =
  await Promise.all([
    supabase.from('parameters').select('id, name, storet_code').order('name'),
    supabase.from('parameter_aliases').select('id, alias, parameter_id, state_code').order('alias'),
  ]);

if (paramError || aliasError) {
  console.error('Query failed:', (paramError && paramError.message) || (aliasError && aliasError.message));
  process.exit(1);
}

const aliasCountByParameter = new Map();
for (const row of aliases || []) {
  aliasCountByParameter.set(row.parameter_id, (aliasCountByParameter.get(row.parameter_id) || 0) + 1);
}

const missingStoret = (parameters || []).filter((p) => !p.storet_code);
const noAliases = (parameters || []).filter((p) => !aliasCountByParameter.get(p.id));

const report = {
  parameter_count: (parameters || []).length,
  alias_count: (aliases || []).length,
  missing_storet_code: missingStoret.map((p) => p.name),
  parameters_without_aliases: noAliases.map((p) => p.name),
  ok: missingStoret.length === 0 && (aliases || []).length >= 50,
};

if (jsonOut) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Parameter alias / STORET validation (2.64)');
  console.log(`Parameters: ${report.parameter_count}`);
  console.log(`Aliases:    ${report.alias_count}`);
  if (report.missing_storet_code.length) {
    console.log(`\nMissing STORET (${report.missing_storet_code.length}):`);
    for (const name of report.missing_storet_code) console.log(`  - ${name}`);
  } else {
    console.log('\nAll parameters have STORET codes.');
  }
  if (report.parameters_without_aliases.length) {
    console.log(`\nNo aliases (${report.parameters_without_aliases.length}):`);
    for (const name of report.parameters_without_aliases.slice(0, 15)) console.log(`  - ${name}`);
    if (report.parameters_without_aliases.length > 15) {
      console.log(`  … +${report.parameters_without_aliases.length - 15} more`);
    }
  }
  console.log(`\nStatus: ${report.ok ? 'PASS (harness)' : 'REVIEW — gaps listed above'}`);
}

process.exit(report.ok ? 0 : 1);
