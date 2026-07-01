#!/usr/bin/env node
/**
 * Bulk-import federal NPDES mappings from SCC_Federal_NPDES_Mapping_IMPORT.csv
 *
 * Updates:
 *   - npdes_id_overrides (ECHO sync)
 *   - npdes_permits.metadata.federal_npdes_id_override (SCC-OS Permit Registry column)
 *
 * Imports only CONFIRMED + IDENTITY rows (skips PROXIMITY, UNKNOWN, ECHO_NOT_TRACKABLE).
 *
 * Usage:
 *   node scripts/import-npdes-overrides.mjs --dry-run
 *   node scripts/import-npdes-overrides.mjs --apply
 *
 * Env (from .env.local):
 *   VITE_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Options:
 *   --csv <path>   Default: ../SOUTHERN COAL/SCC_Federal_NPDES_Mapping_IMPORT.csv
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_CSV = resolve(REPO_ROOT, '..', 'SOUTHERN COAL', 'SCC_Federal_NPDES_Mapping_IMPORT.csv');
const ORG_ID = '2bffc35c-e2c4-4396-868f-207f80e1e2c4';
const IMPORT_SOURCE = 'bulk_import_scc_federal_npdes_mapping_2026_05_25';
const IMPORTABLE_CONFIDENCE = new Set(['CONFIRMED', 'IDENTITY']);
const METADATA_KEY = 'federal_npdes_id_override';

function loadEnvLocal() {
  const envPath = resolve(REPO_ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
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
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseCsv(filePath) {
  const text = readFileSync(filePath, 'utf8').trim();
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  return dataRows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), (values[index] ?? '').trim()])),
  );
}

function parseArgs(argv) {
  const opts = { dryRun: false, apply: false, csv: DEFAULT_CSV };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--apply') opts.apply = true;
    else if (arg === '--csv' && argv[i + 1]) {
      opts.csv = resolve(argv[i + 1]);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  node scripts/import-npdes-overrides.mjs --dry-run
  node scripts/import-npdes-overrides.mjs --apply`);
      process.exit(0);
    }
  }
  if (!opts.dryRun && !opts.apply) opts.dryRun = true;
  return opts;
}

loadEnvLocal();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env.local',
  );
  process.exit(1);
}

const opts = parseArgs(process.argv.slice(2));

if (!existsSync(opts.csv)) {
  console.error(`CSV not found: ${opts.csv}`);
  process.exit(1);
}

const allRows = parseCsv(opts.csv);
const importRows = allRows.filter(
  (r) => IMPORTABLE_CONFIDENCE.has(r.confidence) && r.npdes_id?.trim(),
);

console.log(`CSV: ${opts.csv}`);
console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN'}`);
console.log(`Total CSV rows: ${allRows.length}`);
console.log(`Importable (CONFIRMED+IDENTITY with npdes_id): ${importRows.length}`);

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: permits, error: permitError } = await supabase
  .from('npdes_permits')
  .select('id, permit_number, metadata, state_id, states(code)')
  .eq('organization_id', ORG_ID);

if (permitError) {
  console.error('Failed to load npdes_permits:', permitError.message);
  process.exit(1);
}

const permitByNumber = new Map();
for (const p of permits || []) {
  permitByNumber.set(p.permit_number.trim().toUpperCase(), p);
}

const missing = [];
const toImport = [];

for (const row of importRows) {
  const permitKey = row.permit_number.trim().toUpperCase();
  const npdesId = row.npdes_id.trim().toUpperCase();
  const permit = permitByNumber.get(permitKey);
  if (!permit) {
    missing.push(row.permit_number);
    continue;
  }
  toImport.push({
    row,
    permit,
    permitKey,
    npdesId,
    stateCode: row.state_code.trim().toUpperCase(),
  });
}

console.log(`Matched permits in DB: ${toImport.length}`);
if (missing.length) {
  console.warn(`Unmatched permit_number (${missing.length}):`, missing.join(', '));
}

const overridePayloads = toImport.map(({ permitKey, npdesId, stateCode, row }) => ({
  organization_id: ORG_ID,
  state_code: stateCode,
  source_permit_id: permitKey,
  npdes_id: npdesId,
  notes: `Imported ${IMPORT_SOURCE}; confidence=${row.confidence}`,
  updated_at: new Date().toISOString(),
}));

let overrideOk = 0;
let metadataOk = 0;
const metadataErrors = [];
const overrideErrors = [];

if (opts.apply) {
  const BATCH = 50;
  for (let i = 0; i < overridePayloads.length; i += BATCH) {
    const batch = overridePayloads.slice(i, i + BATCH);
    const { error } = await supabase
      .from('npdes_id_overrides')
      .upsert(batch, { onConflict: 'organization_id,source_permit_id' });
    if (error) {
      overrideErrors.push(error.message);
      break;
    }
    overrideOk += batch.length;
  }

  for (const item of toImport) {
    const existingMeta =
      item.permit.metadata && typeof item.permit.metadata === 'object'
        ? item.permit.metadata
        : {};
    const nextMetadata = {
      ...existingMeta,
      [METADATA_KEY]: item.npdesId,
      federal_npdes_id_override_updated_at: new Date().toISOString(),
      federal_npdes_id_override_source: IMPORT_SOURCE,
      federal_npdes_mapping_confidence: item.row.confidence,
    };

    const { error } = await supabase
      .from('npdes_permits')
      .update({ metadata: nextMetadata })
      .eq('id', item.permit.id);

    if (error) {
      metadataErrors.push({ permit_number: item.permit.permit_number, error: error.message });
    } else {
      metadataOk += 1;
    }
  }

  const skipped = allRows.filter((r) => !IMPORTABLE_CONFIDENCE.has(r.confidence) || !r.npdes_id?.trim());
  const { error: auditError } = await supabase.from('audit_log').insert({
    user_id: null,
    action: 'bulk_npdes_mapping_import',
    module: 'permits',
    table_name: 'npdes_permits',
    record_id: null,
    organization_id: ORG_ID,
    description: `Bulk federal NPDES mapping import (${IMPORT_SOURCE})`,
    new_values: {
      csv_path: opts.csv,
      imported_count: metadataOk,
      override_upserted: overrideOk,
      skipped_count: skipped.length,
      skipped_confidence: [...new Set(skipped.map((r) => r.confidence))],
      unmatched_permit_numbers: missing,
      metadata_errors: metadataErrors,
      override_errors: overrideErrors,
    },
  });

  if (auditError) {
    console.warn('Audit log insert failed (import still applied):', auditError.message);
  }
} else {
  overrideOk = overridePayloads.length;
  metadataOk = toImport.length;
  console.log('\nSample (first 5):');
  for (const item of toImport.slice(0, 5)) {
    console.log(`  ${item.permit.permit_number} -> ${item.npdesId} (${item.row.confidence})`);
  }
  const diff = toImport.filter((i) => i.permitKey !== i.npdesId);
  if (diff.length) {
    console.log(`\nNon-identity mappings (${diff.length}):`);
    for (const item of diff) {
      console.log(`  ${item.permit.permit_number} -> ${item.npdesId}`);
    }
  }
}

console.log('\n--- Result ---');
console.log(`npdes_id_overrides: ${overrideOk}/${overridePayloads.length}`);
console.log(`npdes_permits.metadata: ${metadataOk}/${toImport.length}`);
if (overrideErrors.length) console.error('Override errors:', overrideErrors);
if (metadataErrors.length) {
  console.error(`Metadata errors: ${metadataErrors.length}`);
  for (const e of metadataErrors.slice(0, 5)) console.error(' ', e);
}

if (opts.apply && metadataOk === toImport.length && overrideOk === overridePayloads.length) {
  console.log('\nImport complete.');
  process.exit(0);
}

if (opts.apply) process.exit(metadataErrors.length || overrideErrors.length ? 1 : 0);
process.exit(missing.length ? 1 : 0);
