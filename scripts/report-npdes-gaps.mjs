#!/usr/bin/env node
/**
 * Report active npdes_permits missing federal_npdes_id_override in metadata.
 * Mirrors ECHO Coverage "Registry Mapping Gaps" panel for CLI / CI.
 *
 * Usage:
 *   node scripts/report-npdes-gaps.mjs
 *   node scripts/report-npdes-gaps.mjs --csv gaps.csv
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const ORG_ID = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';
const METADATA_KEY = 'federal_npdes_id_override';

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  let csvPath = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--csv' && args[i + 1]) {
      csvPath = args[i + 1];
      i += 1;
    }
  }
  return { csvPath };
}

loadEnvLocal();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);
const { csvPath } = parseArgs();

const { data: permits, error } = await supabase
  .from('npdes_permits')
  .select('permit_number, metadata, issuing_agency, states(code)')
  .eq('organization_id', ORG_ID)
  .order('permit_number');

if (error) {
  console.error(error.message);
  process.exit(1);
}

const gaps = [];
for (const row of permits || []) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const federal = meta[METADATA_KEY];
  if (typeof federal === 'string' && federal.trim()) continue;
  const stateJoin = row.states;
  const stateCode = Array.isArray(stateJoin) ? stateJoin[0]?.code : stateJoin?.code;
  gaps.push({
    permit_number: row.permit_number,
    state_code: stateCode ?? '',
    issuing_agency: row.issuing_agency ?? '',
  });
}

gaps.sort((a, b) => a.state_code.localeCompare(b.state_code) || a.permit_number.localeCompare(b.permit_number));

const byState = {};
for (const g of gaps) {
  byState[g.state_code] = (byState[g.state_code] || 0) + 1;
}

console.log(`Registry mapping gaps: ${gaps.length} active permit(s) without ${METADATA_KEY}`);
for (const [state, count] of Object.entries(byState).sort()) {
  console.log(`  ${state}: ${count}`);
}

if (csvPath) {
  const lines = ['permit_number,state_code,issuing_agency', ...gaps.map((g) =>
    `${g.permit_number},${g.state_code},${(g.issuing_agency || '').replace(/,/g, ' ')}`,
  )];
  writeFileSync(resolve(process.cwd(), csvPath), lines.join('\n'));
  console.log(`Wrote ${csvPath}`);
}

process.exit(gaps.length > 0 ? 0 : 0);
