#!/usr/bin/env node
/**
 * Create Lane A / SCC WV UAT auth users (staging only).
 *
 * Requires service role (never commit this key):
 *   SUPABASE_URL=https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role_jwt>
 *
 * Optional — use one shared temp password for all four (otherwise a random one is generated and printed):
 *   WV_UAT_TEMP_PASSWORD='YourStagingOnlySecret!'
 *
 * Idempotent: skips users that already exist (by email).
 *
 * After this, run scripts/seed-lane-a-wv-uat.sql in the SQL Editor to attach
 * profiles, roles, org, and visits.
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const USERS = [
  { email: 'wv-uat-sampler@invalid.scc.local', label: 'field_sampler' },
  { email: 'wv-uat-envmgr@invalid.scc.local', label: 'environmental_manager' },
  { email: 'wv-uat-admin@invalid.scc.local', label: 'admin' },
  { email: 'wv-uat-readonly@invalid.scc.local', label: 'read_only' },
];

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Set them in the environment (e.g. from staging .env.local — do not commit the service key).',
  );
  process.exit(1);
}

const password =
  process.env.WV_UAT_TEMP_PASSWORD?.trim() ||
  `WvUat-${randomBytes(12).toString('base64url')}`;

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function alreadyExistsMessage(err) {
  const m = err?.message || '';
  return (
    m.includes('already registered') ||
    m.includes('already been registered') ||
    m.toLowerCase().includes('duplicate') ||
    m.includes('User already registered')
  );
}

async function main() {
  console.log('SCC WV UAT — creating auth users (staging)\n');
  const created = [];
  const skipped = [];

  for (const { email, label } of USERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { lane_a_uat: true, intended_role_hint: label },
    });

    if (error) {
      if (alreadyExistsMessage(error)) {
        skipped.push(email);
        continue;
      }
      console.error(`Failed ${email}:`, error.message);
      process.exit(1);
    }
    created.push({ email, id: data.user?.id });
  }

  if (created.length) {
    console.log('Created:', created.map((c) => `${c.email} (${c.id})`).join('\n       '));
  }
  if (skipped.length) {
    console.log('Already existed (skipped):', skipped.join(', '));
  }

  console.log('\n--- Login (staging) ---');
  console.log('Use email + password sign-in. Shared temp password for all new accounts:');
  console.log(password);
  console.log(
    '\nRotate or replace in Dashboard after first login. Do not reuse in production.\n' +
      'Next: run scripts/seed-lane-a-wv-uat.sql in Supabase SQL Editor.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
