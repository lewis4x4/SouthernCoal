#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(REPO_ROOT, '.qa-artifacts');
const PACK_DATE = '20260704';
const PACK_STEM = `va-npdes-override-candidate-pack-${PACK_DATE}`;

const IMPORTABLE_CONFIDENCE = new Set(['CONFIRMED', 'IDENTITY']);
const ALLOWED_CONFIRMATION_BASIS = [
  'vpdes_pdf',
  'va_deq_ceds',
  'cd_attachment_f',
  'operator_deq_signoff',
  'identity_match',
  'other',
];

const INPUT_SOURCES = [
  '.qa-artifacts/slice6-va-npdes-override-20260702.md',
  '.qa-artifacts/echo-reconciliation-closeout-20260703.md',
  '.qa-artifacts/slice1-activation-gaps-20260703-after.md',
  'docs/NPDES_MAPPING_CLEANUP_BACKLOG.md',
  '../SOUTHERN COAL/SCC_Federal_NPDES_Mapping_GAPS.md',
];

const rows = [];

function add(row) {
  rows.push({
    permit_number: row.permit_number,
    npdes_id: row.npdes_id ?? '',
    state_code: row.state_code,
    confidence: row.confidence,
    confirmation_basis: row.confirmation_basis ?? '',
    confirmation_reference: row.confirmation_reference ?? '',
    review_status: row.review_status,
    category: row.category,
    source_reference: row.source_reference,
    notes: row.notes,
  });
}

const backlogRef = 'docs/NPDES_MAPPING_CLEANUP_BACKLOG.md';
const gapReportRef = '../SOUTHERN COAL/SCC_Federal_NPDES_Mapping_GAPS.md';

for (const permitNumber of [
  '0081742',
  '0081800',
  '0081918',
  '0081954',
  '0081975',
  '0082052',
  '0082053',
  '0082071',
  '0082094',
]) {
  const proposedId = `VA${permitNumber}`;
  const hasTwin = new Set(['0081918', '0081954', '0082071']).has(permitNumber);
  add({
    permit_number: permitNumber,
    npdes_id: proposedId,
    state_code: 'VA',
    confidence: 'CANDIDATE',
    confirmation_basis: 'va_deq_ceds',
    confirmation_reference: `TODO: VA DEQ CEDS or VPDES PDF cite confirming ${permitNumber} maps to ${proposedId}`,
    review_status:
      permitNumber === '0081742'
        ? 'needs_state_conflation_review'
        : hasTwin
          ? 'needs_twin_dedupe_confirmation'
          : 'needs_vpdes_confirmation',
    category: 'va_bare_008_series',
    source_reference: `${backlogRef} VA bare 008-series; ${gapReportRef} VA section 2c and ambiguous IDs`,
    notes:
      'Candidate is prefix restoration only. The May gap report left the federal ID blank pending VPDES PDF or VA DEQ CEDS confirmation.',
  });
}

for (const [permitNumber, proposedId] of [
  ['1102003', 'VA0082003'],
  ['1602068', 'VA0082068'],
]) {
  add({
    permit_number: permitNumber,
    npdes_id: proposedId,
    state_code: 'VA',
    confidence: 'CANDIDATE',
    confirmation_basis: 'cd_attachment_f',
    confirmation_reference: `TODO: CD Attachment F or VA DEQ CEDS cite pairing SMCRA ${permitNumber} to ${proposedId}`,
    review_status: 'needs_dmlr_pairing_confirmation',
    category: 'va_bare_dmlr',
    source_reference: `${backlogRef} VA bare DMLR; ${gapReportRef} VA section 2c`,
    notes:
      'Proposed from the observed VA SMCRA to VPDES digit pattern. Do not promote without a source row pairing the DMLR permit to the federal VPDES ID.',
  });
}

for (const permitNumber of [
  'VA0081554',
  'VA0081916',
  'VA0081917',
  'VA0081918',
  'VA0081949',
  'VA0081954',
  'VA0081991',
  'VA0082042',
  'VA0082047',
  'VA0082051',
  'VA0082054',
  'VA0082066',
  'VA0082071',
  'VA0082074',
]) {
  const hasTwin = new Set(['VA0081918', 'VA0081954', 'VA0082071']).has(permitNumber);
  add({
    permit_number: permitNumber,
    npdes_id: permitNumber,
    state_code: 'VA',
    confidence: 'CANDIDATE',
    confirmation_basis: 'operator_deq_signoff',
    confirmation_reference: `TODO: Operator or VA DEQ sign-off confirming ${permitNumber} is SCC federal VPDES`,
    review_status: hasTwin ? 'needs_twin_dedupe_confirmation' : 'needs_identity_confirmation',
    category: 'va_valid_format_unconfirmed',
    source_reference: `${backlogRef} VA valid-format unconfirmed; ${gapReportRef} VA section 2c`,
    notes:
      'Permit number is already valid federal VPDES format, but local evidence did not confirm it in CD Attachment F Q1-Q3 or ECHO. Promote only after operator, DEQ, CEDS, or permit PDF confirmation.',
  });
}

add({
  permit_number: 'VA0082058',
  npdes_id: '',
  state_code: 'VA',
  confidence: 'BLOCKED',
  confirmation_basis: 'vpdes_pdf',
  confirmation_reference: 'TODO: real SCC VPDES permit PDF or VA DEQ CEDS record for this registry row',
  review_status: 'blocked_false_positive',
  category: 'va_false_positive',
  source_reference: `${backlogRef} VA false positive; ${gapReportRef} false-positive warnings`,
  notes:
    'Do not map to VA0082058. The May gap report says the ECHO hit is Washington District Elementary, not an SCC coal facility.',
});

add({
  permit_number: 'VA1101916',
  npdes_id: 'VA0081916',
  state_code: 'VA',
  confidence: 'CANDIDATE',
  confirmation_basis: 'va_deq_ceds',
  confirmation_reference: 'TODO: VA DEQ CEDS or VPDES PDF cite pairing SMCRA 1101916 to VA0081916',
  review_status: 'needs_dmlr_pairing_and_dedupe',
  category: 'va_pseudo_npdes',
  source_reference: `${backlogRef} VA pseudo-NPDES; ${gapReportRef} VA section 2c`,
  notes:
    'VA1101916 is a rejected pseudo-NPDES value. VA0081916 is only a candidate inferred from the DMLR digit pattern and duplicate registry context.',
});

add({
  permit_number: 'VA0081914',
  npdes_id: 'VA0081914',
  state_code: 'VA',
  confidence: 'PROXIMITY',
  confirmation_basis: 'cd_attachment_f',
  confirmation_reference: 'TODO: primary Q4 2025 CD Attachment F PDF cite confirming VA0081914',
  review_status: 'needs_primary_attachment_f_confirmation',
  category: 'va_proximity_held',
  source_reference: `${backlogRef} VA PROXIMITY held; ${gapReportRef} VA section 2b`,
  notes:
    'Held at PROXIMITY because the primary Q4 2025 Attachment F PDF was not in local folders when the May gap report was prepared.',
});

for (const row of [
  {
    permit_number: 'WV0081742',
    npdes_id: 'VA0081742',
    review_status: 'needs_va_wv_conflation_resolution',
    notes:
      'Registry contains a WV-prefixed row and a VA bare 0081742 row with the same core. Proposed VA0081742 is only for review after state ownership is resolved.',
  },
  {
    permit_number: '1102042',
    npdes_id: 'VA0082042',
    review_status: 'needs_registry_state_resolution',
    notes:
      'Registry says WV DEP, but Lawson operations list places this in VA Outfalls. Proposed VA0082042 is only for review after state/source reconciliation.',
  },
  {
    permit_number: '1102051',
    npdes_id: 'VA0082051',
    review_status: 'needs_registry_state_resolution',
    notes:
      'Registry says WV DEP, but Lawson operations list places this in VA Outfalls. Proposed VA0082051 is only for review after state/source reconciliation.',
  },
]) {
  add({
    ...row,
    state_code: 'WV',
    confidence: 'CANDIDATE',
    confirmation_basis: 'va_deq_ceds',
    confirmation_reference: `TODO: resolve registry state and cite VA DEQ CEDS/VPDES source before mapping ${row.permit_number}`,
    category: 'wv_va_state_conflict',
    source_reference: `${backlogRef} WV conflicts; ${gapReportRef} ambiguous duplicate registry IDs`,
  });
}

add({
  permit_number: 'WV-UAT-FAKE-001',
  npdes_id: '',
  state_code: 'WV',
  confidence: 'DELETE_ROW',
  confirmation_basis: '',
  confirmation_reference: '',
  review_status: 'delete_test_fixture',
  category: 'wv_test_fixture',
  source_reference: `${backlogRef} WV permits; ${gapReportRef} ambiguous duplicate registry IDs`,
  notes:
    'Not a mapping candidate. The May gap report identifies this as a UAT/test fixture row and recommends deleting it from npdes_permits.',
});

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function mdCell(value) {
  return String(value ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
}

function countBy(key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function validateRows() {
  if (rows.length !== 32) {
    throw new Error(`Expected 32 unresolved federal-ID rows, found ${rows.length}`);
  }
  const invalidBasis = rows.filter(
    (row) =>
      row.confirmation_basis &&
      !ALLOWED_CONFIRMATION_BASIS.includes(row.confirmation_basis),
  );
  if (invalidBasis.length) {
    throw new Error(`Invalid confirmation basis values: ${invalidBasis.map((r) => r.permit_number).join(', ')}`);
  }
  const importReady = rows.filter(
    (row) => IMPORTABLE_CONFIDENCE.has(row.confidence) && row.npdes_id,
  );
  if (importReady.length) {
    throw new Error(`Candidate pack must not contain import-ready rows: ${importReady.map((r) => r.permit_number).join(', ')}`);
  }
}

validateRows();

mkdirSync(OUT_DIR, { recursive: true });

const csvHeaders = [
  'permit_number',
  'npdes_id',
  'state_code',
  'confidence',
  'confirmation_basis',
  'confirmation_reference',
  'review_status',
  'category',
  'source_reference',
  'notes',
];

const csv = [
  csvHeaders.join(','),
  ...rows.map((row) => csvHeaders.map((header) => csvEscape(row[header])).join(',')),
].join('\n');

const json = {
  generated_at: '2026-07-04',
  purpose:
    'Selective review pack for active SCC registry rows still missing federal_npdes_id_override metadata.',
  import_guard:
    'Rows are not import-ready by default. Promote a row by replacing TODO confirmation_reference text and changing confidence to CONFIRMED or IDENTITY after source review.',
  input_sources: INPUT_SOURCES,
  allowed_confirmation_basis: ALLOWED_CONFIRMATION_BASIS,
  counts: {
    total_rows: rows.length,
    rows_with_proposed_npdes_id: rows.filter((row) => row.npdes_id).length,
    import_ready_rows: rows.filter((row) => IMPORTABLE_CONFIDENCE.has(row.confidence)).length,
    by_state: countBy('state_code'),
    by_category: countBy('category'),
    by_review_status: countBy('review_status'),
  },
  rows,
};

const mdLines = [
  '# VA NPDES Override Candidate Pack',
  '',
  '**Generated:** 2026-07-04',
  '**Import posture:** 0 rows are import-ready by default. This pack is for selective review.',
  '',
  '## Inputs',
  '',
  ...INPUT_SOURCES.map((source) => `- \`${source}\``),
  '',
  '## Counts',
  '',
  `- Total unresolved federal-ID rows covered: ${rows.length}`,
  `- VA rows: ${rows.filter((row) => row.state_code === 'VA').length}`,
  `- WV/data-quality rows: ${rows.filter((row) => row.state_code === 'WV').length}`,
  `- Rows with proposed NPDES IDs: ${rows.filter((row) => row.npdes_id).length}`,
  '- Rows safe for immediate import: 0',
  '',
  '## Confirmation Loop',
  '',
  '1. Open the CSV and review one row against the named source.',
  '2. Replace the TODO confirmation_reference with the actual CEDS, VPDES PDF, CD Attachment F, or operator/DEQ citation.',
  '3. Change confidence to CONFIRMED or IDENTITY only for that reviewed row.',
  '4. Upload the edited CSV in External Data Sync -> Bulk NPDES crosswalk import.',
  '5. Preview must show only the promoted rows as ready to import; unpromoted CANDIDATE/PROXIMITY/BLOCKED rows remain skipped.',
  '',
  'Do not use `npm run import:npdes-mappings -- --apply` for this pack.',
  '',
  '## Allowed Confirmation Basis Values',
  '',
  ...ALLOWED_CONFIRMATION_BASIS.map((basis) => `- \`${basis}\``),
  '',
  '## Candidate Rows',
  '',
  '| permit_number | npdes_id | state | confidence | basis | review_status | category | notes |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map(
    (row) =>
      `| ${mdCell(row.permit_number)} | ${mdCell(row.npdes_id || 'TBD')} | ${mdCell(row.state_code)} | ${mdCell(row.confidence)} | ${mdCell(row.confirmation_basis || 'TBD')} | ${mdCell(row.review_status)} | ${mdCell(row.category)} | ${mdCell(row.notes)} |`,
  ),
  '',
];

const csvPath = resolve(OUT_DIR, `${PACK_STEM}.csv`);
const jsonPath = resolve(OUT_DIR, `${PACK_STEM}.json`);
const mdPath = resolve(OUT_DIR, `${PACK_STEM}.md`);

writeFileSync(csvPath, `${csv}\n`);
writeFileSync(jsonPath, `${JSON.stringify(json, null, 2)}\n`);
writeFileSync(mdPath, mdLines.join('\n'));

console.log(`Generated ${rows.length} VA override candidate rows`);
console.log(`CSV: ${csvPath}`);
console.log(`JSON: ${jsonPath}`);
console.log(`Markdown: ${mdPath}`);
