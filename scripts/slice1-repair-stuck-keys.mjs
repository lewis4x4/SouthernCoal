#!/usr/bin/env node
/** Repair stuck Slice 1 keys where lab_results exist but exceedances were never created. */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCC_ORG = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
}

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

async function rpc(name, args) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name}: ${res.status} ${text}`);
  return JSON.parse(text);
}

async function main() {
  const result = await rpc('repair_slice1_stuck_mirror_keys', {
    p_organization_id: SCC_ORG,
    p_limit: arg('--limit', 100),
  });
  console.log(result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
