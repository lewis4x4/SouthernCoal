#!/usr/bin/env tsx
/**
 * Export live pg_policies snapshot for SUP-001 patrol baseline.
 * Requires SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_SERVICE_ROLE_KEY) and deployed patrol_export_rls_policies().
 */

import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const defaultOut = resolve(
  process.cwd(),
  'patrol/baselines/pg_policies.snapshot.json',
);

async function main() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const outPath = resolve(process.argv[2] || defaultOut);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase.rpc('patrol_export_rls_policies');

  if (error) {
    console.error('patrol_export_rls_policies failed:', error.message);
    if (error.message.includes('PGRST202')) {
      console.error(
        'Deploy migration 20260518130000_patrol_rls_policy_export.sql before exporting.',
      );
    }
    process.exit(1);
  }

  const policies = Array.isArray(data) ? data : data ?? [];
  const snapshot = {
    version: 1,
    source: 'pg_policies',
    schemas: ['public', 'storage'],
    exported_at: new Date().toISOString(),
    supabase_project_ref: process.env.VITE_SUPABASE_PROJECT_ID || null,
    policy_count: policies.length,
    policies,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${policies.length} policies to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
