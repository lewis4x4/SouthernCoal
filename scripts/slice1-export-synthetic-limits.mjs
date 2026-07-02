#!/usr/bin/env node
/** Export SYNTHETIC_UAT_SLICE1 permit_limits for human PDF verification. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCC_ORG = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function fetchLimits() {
  const query = new URLSearchParams({
    select:
      'limit_type,limit_value,unit,review_status,npdes_permits!inner(permit_number,organization_id),outfalls(outfall_number),parameters(name,parameter_code)',
    'npdes_permits.organization_id': `eq.${SCC_ORG}`,
    condition_notes: 'ilike.%25SYNTHETIC_UAT_SLICE1%25',
    limit: '2000',
    order: 'review_status.asc',
  });
  const res = await fetch(`${url}/rest/v1/permit_limits?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`fetch: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const rows = await fetchLimits();
  const dateStamp = new Date().toISOString().slice(0, 10);
  const header =
    'permit_number,outfall_number,parameter_code,parameter_name,limit_type,limit_value,unit,review_status';
  const lines = rows.map((row) => {
    const permit = row.npdes_permits?.permit_number ?? '';
    const outfall = row.outfalls?.outfall_number ?? '';
    const param = row.parameters ?? {};
    return [
      permit,
      outfall,
      param.parameter_code ?? '',
      param.name ?? '',
      row.limit_type,
      row.limit_value ?? '',
      row.unit,
      row.review_status,
    ]
      .map(csvEscape)
      .join(',');
  });

  const outDir = resolve(REPO_ROOT, '.qa-artifacts');
  mkdirSync(outDir, { recursive: true });
  const path = resolve(outDir, `slice1-synthetic-limits-${dateStamp}.csv`);
  writeFileSync(path, [header, ...lines].join('\n'));
  console.log(`Wrote ${rows.length} synthetic limits to ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
