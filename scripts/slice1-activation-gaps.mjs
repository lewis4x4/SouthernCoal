#!/usr/bin/env node
/**
 * Slice 1 — activation funnel: ECHO violations → permit graph → exceedance mirror.
 * Invoked by `npm run qa:slice1-activation-gaps`.
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

function mdTable(rows, cols) {
  const header = `| ${cols.join(' | ')} |`;
  const sep = `| ${cols.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${cols.map((c) => r[c] ?? '').join(' | ')} |`).join('\n');
  return [header, sep, body].filter(Boolean).join('\n');
}

async function main() {
  const report = await rpc('report_slice1_activation_gaps', {
    p_organization_id: SCC_ORG,
  });

  const { funnel, mirror_keys, pending_missing_internal, permits_without_federal_override, synthetic_echo_limits, top_permits_missing_limits } =
    report;

  console.log('Slice 1 activation funnel:');
  console.log(JSON.stringify(report, null, 2));

  const top = (top_permits_missing_limits ?? []).slice(0, 10);
  const md = `# Slice 1 — activation gap report

**Org:** \`${SCC_ORG}\`  
**Generated:** ${new Date().toISOString()}

## Funnel (distinct npdes:outfall:parameter keys)

| Stage | Count |
|-------|------:|
| Violation keys | ${funnel.distinct_violation_keys} |
| No registry permit | ${funnel.no_permit} |
| Has permit | ${funnel.has_permit} |
| Has outfall | ${funnel.has_outfall} |
| Has parameter | ${funnel.has_parameter} |
| Has permit_limit | ${funnel.has_permit_limit} |

## Backlog

| Metric | Count |
|--------|------:|
| \`slice1_echo_mirror_keys\` | ${mirror_keys} |
| Pending \`missing_internal\` | ${pending_missing_internal} |
| Permits without federal override | ${permits_without_federal_override} |
| SYNTHETIC ECHO limits | ${synthetic_echo_limits} |

## Interpretation

- **Mirror seeding exhausted** when \`mirror_keys ≈ has_permit_limit\` distinct keys — remaining pending rows are monthly ECHO violations without resolvable permit limits or internal graph.
- **Shrink pending** by uploading permits + limits via Upload Dashboard, mapping VA federal IDs (Slice 6), then re-run \`npm run qa:slice1-seed-exceedances\` + \`npm run qa:slice1-reconcile\`.

## Top permits missing limits (outfall + parameter matched, no limit row)

${top.length ? mdTable(top, ['permit_number', 'npdes_id', 'missing_limit_keys']) : '_None_'}

## Raw JSON

\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`
`;

  const outDir = resolve(REPO_ROOT, '.qa-artifacts');
  mkdirSync(outDir, { recursive: true });
  const path = resolve(outDir, 'slice1-activation-gaps-20260702.md');
  writeFileSync(path, md);
  console.log(`Artifact: ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
