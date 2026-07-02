#!/usr/bin/env node
/** Export top permit limit gaps from report_slice1_activation_gaps. */

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

async function main() {
  const res = await fetch(`${url}/rest/v1/rpc/report_slice1_activation_gaps`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_organization_id: SCC_ORG }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  const report = JSON.parse(text);
  const rows = report.top_permits_missing_limits ?? [];
  const lines = [
    'permit_number,npdes_id,missing_limit_keys',
    ...rows.map(
      (r) => `${r.permit_number},${r.npdes_id},${r.missing_limit_keys}`,
    ),
  ];
  const outDir = resolve(REPO_ROOT, '.qa-artifacts');
  mkdirSync(outDir, { recursive: true });
  const path = resolve(outDir, 'slice1-limit-gaps.csv');
  writeFileSync(path, lines.join('\n'));
  console.log(`Wrote ${rows.length} rows to ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
