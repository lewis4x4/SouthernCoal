#!/usr/bin/env node
/**
 * Slice 2 — verify calculate_dmr_values + mass loading on synthetic KYGE40869 submission.
 * Invoked by `npm run qa:slice2-dmr`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SYNTHETIC_SUBMISSION_ID = 'f0001002-0002-4002-8002-000000000002';
const SYNTHETIC_TSS_LINE_ID = 'f0001003-0003-4003-8003-000000000003';
const EXPECTED_FLOW_MGD = 2.5;
const EXPECTED_TSS_MG_L = 18.4;
const EXPECTED_MASS_LOADING = Math.round(EXPECTED_TSS_MG_L * EXPECTED_FLOW_MGD * 8.34 * 10000) / 10000;

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
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
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
  return text ? JSON.parse(text) : null;
}

async function main() {
  const calc = await rpc('calculate_dmr_values', {
    p_submission_id: SYNTHETIC_SUBMISSION_ID,
  });

  const massUpdated = await rpc('apply_dmr_mass_loading_for_submission', {
    p_submission_id: SYNTHETIC_SUBMISSION_ID,
  });

  const lineRes = await fetch(
    `${url}/rest/v1/dmr_line_items?select=id,concentration_max,concentration_units,calculation_warnings,mass_loading_lbs_day,quantity_max&dmr_submission_id=eq.${SYNTHETIC_SUBMISSION_ID}&id=eq.${SYNTHETIC_TSS_LINE_ID}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const lines = await lineRes.json();
  const tssLine = lines[0];

  const tssWarnings = Array.isArray(tssLine?.calculation_warnings)
    ? tssLine.calculation_warnings
    : [];
  const hasSilentFallback = tssWarnings.some((w) => w?.type === 'silent_unit_fallback');

  const calcPass =
    calc.status === 'calculated' &&
    Number(calc.populated ?? 0) >= 1 &&
    Number(tssLine?.concentration_max) === EXPECTED_TSS_MG_L &&
    !hasSilentFallback;

  const massWarnings = Array.isArray(tssLine?.calculation_warnings)
    ? tssLine.calculation_warnings
    : [];
  const hasMassWarning = massWarnings.some((w) => w?.type === 'mass_loading_calculated');

  const massPass =
    Number(massUpdated) >= 1 &&
    tssLine?.mass_loading_lbs_day != null &&
    Math.abs(Number(tssLine.mass_loading_lbs_day) - EXPECTED_MASS_LOADING) < 0.01 &&
    hasMassWarning;

  const pass = calcPass && massPass;

  const artifact = resolve(
    REPO_ROOT,
    '.qa-artifacts',
    `slice2-dmr-preflight-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.md`,
  );
  mkdirSync(resolve(REPO_ROOT, '.qa-artifacts'), { recursive: true });
  writeFileSync(
    artifact,
    `# Slice 2 — DMR calculate + mass loading preflight

**Submission:** \`${SYNTHETIC_SUBMISSION_ID}\` (KYGE40869 Jan 2026 synthetic)

## calculate_dmr_values result

\`\`\`json
${JSON.stringify(calc, null, 2)}
\`\`\`

## apply_dmr_mass_loading_for_submission

- **Rows updated:** ${massUpdated}
- **Expected mass loading (TSS line):** ${EXPECTED_MASS_LOADING} lbs/day (${EXPECTED_TSS_MG_L} mg/L × ${EXPECTED_FLOW_MGD} MGD × 8.34)

## TSS line item

\`\`\`json
${JSON.stringify(tssLine, null, 2)}
\`\`\`

**Calc pass:** ${calcPass ? 'yes' : 'NO'}
**Mass loading pass:** ${massPass ? 'yes' : 'NO'}
**Pass:** ${pass ? 'yes' : 'NO'}
`,
    'utf8',
  );

  console.log('calculate_dmr_values:', calc);
  console.log('apply_dmr_mass_loading_for_submission:', massUpdated);
  console.log('TSS line mass_loading_lbs_day:', tssLine?.mass_loading_lbs_day);
  console.log(`Artifact: ${artifact}`);
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
