#!/usr/bin/env tsx
/**
 * Diff live RLS policies against patrol/baselines/pg_policies.snapshot.json (SUP-001).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

type PolicyRow = {
  schemaname: string;
  tablename: string;
  policyname: string;
  cmd: string;
  permissive?: string;
  roles?: string[];
  qual?: string | null;
  with_check?: string | null;
};

function policyKey(p: PolicyRow): string {
  return `${p.schemaname}.${p.tablename}.${p.policyname}.${p.cmd}`;
}

function normalizePolicies(raw: unknown): PolicyRow[] {
  if (!Array.isArray(raw)) return [];
  return raw as PolicyRow[];
}

async function main() {
  const baselinePath = resolve(
    process.argv[2] || 'patrol/baselines/pg_policies.snapshot.json',
  );

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase URL or service role key');
    process.exit(1);
  }

  let baseline: { policies?: PolicyRow[] };
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch {
    console.error(`Cannot read baseline: ${baselinePath}`);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase.rpc('patrol_export_rls_policies');

  if (error) {
    console.error('Live export failed:', error.message);
    process.exit(1);
  }

  const live = normalizePolicies(data);
  const base = normalizePolicies(baseline.policies);

  const liveMap = new Map(live.map((p) => [policyKey(p), p]));
  const baseMap = new Map(base.map((p) => [policyKey(p), p]));

  const added = live.filter((p) => !baseMap.has(policyKey(p)));
  const removed = base.filter((p) => !liveMap.has(policyKey(p)));
  const modified: { key: string; fields: string[] }[] = [];

  for (const [key, livePolicy] of liveMap) {
    const basePolicy = baseMap.get(key);
    if (!basePolicy) continue;
    const fields: string[] = [];
    for (const field of ['qual', 'with_check', 'roles', 'permissive'] as const) {
      const a = JSON.stringify(livePolicy[field] ?? null);
      const b = JSON.stringify(basePolicy[field] ?? null);
      if (a !== b) fields.push(field);
    }
    if (fields.length > 0) modified.push({ key, fields });
  }

  const drift = added.length + removed.length + modified.length > 0;

  console.log(JSON.stringify({ drift, added: added.length, removed: removed.length, modified: modified.length }, null, 2));

  if (added.length) {
    console.log('\nAdded:');
    added.slice(0, 20).forEach((p) => console.log(`  + ${policyKey(p)}`));
    if (added.length > 20) console.log(`  ... and ${added.length - 20} more`);
  }
  if (removed.length) {
    console.log('\nRemoved:');
    removed.slice(0, 20).forEach((p) => console.log(`  - ${policyKey(p)}`));
    if (removed.length > 20) console.log(`  ... and ${removed.length - 20} more`);
  }
  if (modified.length) {
    console.log('\nModified:');
    modified.slice(0, 20).forEach((m) => console.log(`  ~ ${m.key} (${m.fields.join(', ')})`));
    if (modified.length > 20) console.log(`  ... and ${modified.length - 20} more`);
  }

  process.exit(drift ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
