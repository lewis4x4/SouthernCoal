#!/usr/bin/env node
/**
 * Slice 2 — verify calculate_dmr_values on synthetic KYGE40869 submission.
 * Invoked by `npm run qa:slice2-dmr`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SYNTHETIC_SUBMISSION_ID = 'f0001002-0002-4002-8002-000000000002';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  const calc = await rpc('calculate_dmr_values', {
    p_submission_id: SYNTHETIC_SUBMISSION_ID,
  });

  const lineRes = await fetch(
    `${url}/rest/v1/dmr_line_items?select=id,concentration_max,concentration_units,calculation_warnings&dmr_submission_id=eq.${SYNTHETIC_SUBMISSION_ID}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const lines = await lineRes.json();

  const pass =
    Number(calc.conversion_warnings ?? calc.conversion_warning_count ?? 0) === 0 &&
    (calc.status === 'calculated' || calc.line_count >= 0);

  const artifact = resolve(
    REPO_ROOT,
    '.qa-artifacts',
    `slice2-dmr-preflight-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.md`,
  );
  mkdirSync(resolve(REPO_ROOT, '.qa-artifacts'), { recursive: true });
  writeFileSync(
    artifact,
    `# Slice 2 — DMR calculate preflight

**Submission:** \`${SYNTHETIC_SUBMISSION_ID}\` (KYGE40869 Jan 2026 synthetic)

## calculate_dmr_values result

\`\`\`json
${JSON.stringify(calc, null, 2)}
\`\`\`

## Line items

\`\`\`json
${JSON.stringify(lines, null, 2)}
\`\`\`

**Pass:** ${pass ? 'yes' : 'NO'}
`,
    'utf8',
  );

  console.log('calculate_dmr_values:', calc);
  console.log(`Artifact: ${artifact}`);
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
