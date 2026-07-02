#!/usr/bin/env node
/**
 * Slice 5 — validate compliance_snapshots against raw org counts.
 * Invoked by `npm run qa:slice5-compliance-snapshot`.
 */

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

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

async function rpc(name, body) {
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function headCount(table, filter) {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&${filter}`, {
    headers: { ...headers, Prefer: 'count=exact' },
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  const range = res.headers.get('content-range') ?? '';
  const total = range.split('/')[1];
  return Number(total ?? 0);
}

async function fetchAllPermitIds(orgId) {
  const ids = [];
  let offset = 0;
  const page = 1000;
  while (true) {
    const res = await fetch(
      `${url}/rest/v1/npdes_permits?select=id&organization_id=eq.${orgId}&limit=${page}&offset=${offset}`,
      { headers },
    );
    if (!res.ok) throw new Error(`npdes_permits: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    ids.push(...batch.map((row) => row.id));
    if (batch.length < page) break;
    offset += page;
  }
  return ids;
}

async function countOutfallsForPermits(permitIds, activeOnly) {
  if (permitIds.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < permitIds.length; i += 80) {
    const chunk = permitIds.slice(i, i + 80);
    let filter = `permit_id=in.(${chunk.join(',')})`;
    if (activeOnly) filter += '&is_active=eq.true';
    total += await headCount('outfalls', filter);
  }
  return total;
}

async function main() {
  const dateStamp = new Date().toISOString().slice(0, 10);

  await rpc('generate_compliance_snapshot', {
    p_org_id: SCC_ORG,
    p_snapshot_date: dateStamp,
  });

  const snapRes = await fetch(
    `${url}/rest/v1/compliance_snapshots?select=total_permits,active_permits,total_outfalls,active_outfalls,dmr_submissions_due,compliance_score,snapshot_date&organization_id=eq.${SCC_ORG}&order=snapshot_date.desc&limit=1`,
    { headers },
  );
  if (!snapRes.ok) throw new Error(`compliance_snapshots: ${snapRes.status} ${await snapRes.text()}`);
  const [snapshot] = await snapRes.json();

  const stats = await rpc('get_upload_dashboard_domain_stats', {
    p_organization_id: SCC_ORG,
  });

  const [activePermits, allPermitIds] = await Promise.all([
    headCount('npdes_permits', `organization_id=eq.${SCC_ORG}&status=eq.active`),
    fetchAllPermitIds(SCC_ORG),
  ]);

  const [rawOutfalls, activeOutfalls] = await Promise.all([
    countOutfallsForPermits(allPermitIds, false),
    countOutfallsForPermits(allPermitIds, true),
  ]);

  const rawPermits = stats?.total_permits ?? allPermitIds.length;

  const rows = [
    ['total_permits', snapshot?.total_permits, rawPermits],
    ['active_permits', snapshot?.active_permits, activePermits],
    ['total_outfalls', snapshot?.total_outfalls, rawOutfalls],
    ['active_outfalls', snapshot?.active_outfalls, activeOutfalls],
  ];

  const md = `# Slice 5 — compliance snapshot validation

**Date:** ${dateStamp}  
**Org:** ${SCC_ORG}

| Field | Snapshot | Raw count | Match |
|-------|----------|----------:|:-----:|
${rows
  .map(
    ([field, snap, raw]) =>
      `| ${field} | ${snap ?? '—'} | ${raw} | ${snap === raw ? '✓' : '✗'} |`,
  )
  .join('\n')}

**compliance_score:** ${snapshot?.compliance_score ?? '—'}  
**snapshot_date:** ${snapshot?.snapshot_date ?? '—'}
`;

  const outDir = resolve(REPO_ROOT, '.qa-artifacts');
  mkdirSync(outDir, { recursive: true });
  const path = resolve(outDir, `slice5-compliance-snapshot-${dateStamp}.md`);
  writeFileSync(path, md);

  const mismatches = rows.filter(([, snap, raw]) => snap !== raw);
  console.log(`Snapshot date: ${snapshot?.snapshot_date ?? 'none'}`);
  for (const [field, snap, raw] of rows) {
    console.log(`  ${field}: snapshot=${snap} raw=${raw}${snap === raw ? '' : ' MISMATCH'}`);
  }
  console.log(`Artifact: ${path}`);
  if (mismatches.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
