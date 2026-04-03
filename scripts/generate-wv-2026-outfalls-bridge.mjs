import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const repoRoot = path.resolve(process.cwd(), '..');
const workbookPath = process.argv[2] ?? '/Users/brianlewis/Downloads/WV 2026 OUTFALLS.xlsx';
const outputPath = process.argv[3] ?? path.join(repoRoot, 'WV_2026_Outfalls_DNR_to_NPDES_Bridge_COMPLETED.md');
const publicCrosswalkPath = path.join(repoRoot, 'WV_SMCRA_to_NPDES_Crosswalk_EPA_Consent_Decree.md');
const inventoryPath = path.join(repoRoot, 'SCC_NPDES_Permit_Inventory.csv');

function parseCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim();
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
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
  );
}

function parsePublicCrosswalk(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const map = new Map();
  for (const line of lines) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
    if (!match) continue;
    const smcra = match[1].trim();
    const npdes = match[2].trim();
    const facility = match[3].trim();
    if (smcra === 'SMCRA / Mining Permit Number') continue;
    map.set(smcra, { npdes, facility, basis: 'public_doj_epa' });
  }
  return map;
}

function extractWorkbookEntries(filePath) {
  const wb = XLSX.readFile(filePath);
  const entries = new Map();

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    let currentDnr = '';

    for (let i = 2; i < rows.length; i += 1) {
      const row = rows[i];
      const dnr = String(row[3] ?? '').trim();
      if (dnr) currentDnr = dnr;
      if (!currentDnr) continue;

      if (!entries.has(currentDnr)) {
        entries.set(currentDnr, {
          dnrEntry: currentDnr,
          outfalls: new Set(),
          gwsw: new Set(),
          coords: [],
        });
      }

      const entry = entries.get(currentDnr);
      const point = String(row[4] ?? '').trim();
      const lat = String(row[1] ?? '').trim();
      const lon = String(row[2] ?? '').trim();

      if (sheetName === 'WV Outfalls') {
        if (point) entry.outfalls.add(point);
      } else if (point) {
        entry.gwsw.add(point);
      }

      if (lat && lon) {
        entry.coords.push(`${lat}, ${lon}`);
      }
    }
  }

  return [...entries.values()].sort((a, b) => a.dnrEntry.localeCompare(b.dnrEntry));
}

function basisLabel(basis) {
  switch (basis) {
    case 'public_doj_epa':
      return 'Public crosswalk';
    case 'public_eqb_bundle':
      return 'Public EQB complex';
    case 'direct_npdes':
      return 'Direct NPDES in workbook';
    case 'best_fit_exact':
      return 'Best-fit exact fingerprint';
    case 'best_fit_partial':
      return 'Best-fit partial fingerprint';
    default:
      return basis;
  }
}

function confidenceLabel(bases) {
  const unique = [...new Set(bases)];
  if (unique.every((basis) => ['public_doj_epa', 'public_eqb_bundle', 'direct_npdes'].includes(basis))) {
    return 'PUBLIC';
  }
  if (unique.every((basis) => ['best_fit_exact', 'best_fit_partial'].includes(basis))) {
    return unique.includes('best_fit_partial') ? 'BEST-FIT (LOWER)' : 'BEST-FIT';
  }
  return 'MIXED';
}

function formatSet(values) {
  return values.length ? values.join(', ') : 'None';
}

function dedupe(values) {
  return [...new Set(values)];
}

const publicMap = parsePublicCrosswalk(publicCrosswalkPath);
const inventory = parseCsv(inventoryPath)
  .filter((row) => row.State === 'WV')
  .reduce((map, row) => {
    map.set(row['Permit Number'], row);
    return map;
  }, new Map());

const overrides = new Map([
  ['E002500', { npdes: 'WV0090000', facility: 'No. 50 Mine / Pinnacle Mine Complex', basis: 'public_eqb_bundle', note: 'EQB status report says WV0090000 governs U020483 and associated surface permits E002500, O013883, O400892, O401097, O402292, U070700.' }],
  ['O013883', { npdes: 'WV0090000', facility: 'No. 50 Mine / Pinnacle Mine Complex', basis: 'public_eqb_bundle', note: 'EQB status report bundled permit complex under WV0090000.' }],
  ['O400892', { npdes: 'WV0090000', facility: 'No. 50 Mine / Pinnacle Mine Complex', basis: 'public_eqb_bundle', note: 'EQB status report bundled permit complex under WV0090000.' }],
  ['O401097', { npdes: 'WV0090000', facility: 'No. 50 Mine / Pinnacle Mine Complex', basis: 'public_eqb_bundle', note: 'EQB status report bundled permit complex under WV0090000.' }],
  ['O402292', { npdes: 'WV0090000', facility: 'No. 50 Mine / Pinnacle Mine Complex', basis: 'public_eqb_bundle', note: 'EQB status report bundled permit complex under WV0090000.' }],
  ['U020483', { npdes: 'WV0090000', facility: 'No. 50 Mine / Pinnacle Mine Complex', basis: 'public_eqb_bundle', note: 'EQB status report says WV0090000 governs U020483 and associated permits.' }],
  ['U070700', { npdes: 'WV0090000', facility: 'No. 50 Mine / Pinnacle Mine Complex', basis: 'public_eqb_bundle', note: 'EQB status report bundled permit complex under WV0090000.' }],
  ['O012083', { npdes: 'WV0065048', facility: 'Orchard Coal Loadout', basis: 'best_fit_exact', note: 'Workbook fingerprint exactly matches local WV0065048 pattern: outfalls 001-003 and GWSW DCOC-4, DPC-2, UCDC-3, UPC1.' }],
  ['S400511', { npdes: 'WV1025929', facility: 'Big Creek Surface Mine', basis: 'best_fit_exact', note: 'Workbook fingerprint exactly matches local WV1025929 pattern: BAS-1/BAS-4, DSJF-2, DSTB-1, USJF-1/2, USTB-1/2.' }],
  ['U022083', { npdes: 'WV0052531', facility: 'Seneca Mine', basis: 'best_fit_exact', note: 'Workbook coordinates, numeric outfalls 003/004/010/011/012, and GWSW DSEC04/USEC10 align with WV0052531.' }],
  ['U300515', { npdes: 'WV1028324', facility: 'Valls Creek Deep Mine', basis: 'best_fit_partial', note: 'Workbook coordinates are near WV1028324 and DVC/UVC exactly match local DMR footprint; additional GW/DKC/UKC points are not present in local exports.' }],
  ['WV1024230', { npdes: 'WV1024230', facility: 'Eckmann Loadout', basis: 'direct_npdes', note: 'Workbook already provides the NPDES permit number directly.' }],
]);

function resolveComponent(component) {
  if (overrides.has(component)) return overrides.get(component);
  if (publicMap.has(component)) return publicMap.get(component);
  if (/^WV\d+$/.test(component) && inventory.has(component)) {
    return {
      npdes: component,
      facility: inventory.get(component)['Facility Name'],
      basis: 'direct_npdes',
      note: 'Workbook entry is already an NPDES permit number.',
    };
  }
  return null;
}

const entries = extractWorkbookEntries(workbookPath);
const rows = entries.map((entry, index) => {
  const components = entry.dnrEntry.split('/').map((value) => value.trim()).filter(Boolean);
  const componentResults = components.map((component) => ({ component, result: resolveComponent(component) }));
  const unresolved = componentResults.filter((item) => !item.result).map((item) => item.component);
  const resolved = componentResults.filter((item) => item.result);
  const npdesPermits = dedupe(resolved.map((item) => item.result.npdes));
  const facilities = dedupe(resolved.map((item) => item.result.facility));
  const bases = resolved.map((item) => item.result.basis);
  const notes = dedupe(resolved.map((item) => item.result.note).filter(Boolean));
  const componentDetail = componentResults.map((item) =>
    item.result
      ? `${item.component} -> ${item.result.npdes}`
      : `${item.component} -> UNRESOLVED`,
  );

  return {
    index: index + 1,
    dnrEntry: entry.dnrEntry,
    components,
    npdesPermits,
    facilities,
    outfalls: [...entry.outfalls].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
    gwsw: [...entry.gwsw].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    coords: dedupe(entry.coords).slice(0, 3),
    confidence: unresolved.length ? 'PARTIAL' : confidenceLabel(bases),
    basis: dedupe(bases).map(basisLabel),
    componentDetail,
    notes,
    unresolved,
  };
});

const summary = {
  total: rows.length,
  publicOnly: rows.filter((row) => row.confidence === 'PUBLIC').length,
  mixed: rows.filter((row) => row.confidence === 'MIXED').length,
  bestFit: rows.filter((row) => row.confidence === 'BEST-FIT').length,
  bestFitLower: rows.filter((row) => row.confidence === 'BEST-FIT (LOWER)').length,
  partial: rows.filter((row) => row.confidence === 'PARTIAL').length,
};

const lines = [];
lines.push('# WV 2026 Outfalls DNR to NPDES Permit Bridge');
lines.push('');
lines.push('**Generated:** 2026-04-03');
lines.push(`**Workbook Source:** \`${workbookPath}\``);
lines.push('**Primary Public Bridge Source:** DOJ/EPA Southern Coal appendices A-E');
lines.push('**Primary Public Bridge Link:** https://www.justice.gov/sites/default/files/enrd/pages/attachments/2016/10/03/appendices_a-e.pdf');
lines.push('**Supporting Local Sources:** `WV_SMCRA_to_NPDES_Crosswalk_EPA_Consent_Decree.md`, `SCC_NPDES_Permit_Inventory.csv`, `SCC_DMR_Export_CY2025_KY_WV_TN.csv`, `reports/SCC_Permit_Outfall_Report_2026-02-22.csv`');
lines.push('');
lines.push('**Confidence Legend:**');
lines.push('- **PUBLIC** — every component in the workbook entry is bridged by a public source or is already an NPDES number');
lines.push('- **MIXED** — workbook entry combines public bridges with best-fit bridges');
lines.push('- **BEST-FIT** — not in the public bridge table, but workbook outfall / GWSW fingerprints exactly match local WV permit exports');
lines.push('- **BEST-FIT (LOWER)** — closest fit by coordinates and partial monitoring-point match, but not fully confirmed in public source');
lines.push('- **PARTIAL** — at least one component remains unresolved');
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push('| Metric | Count |');
lines.push('|---|---:|');
lines.push(`| Unique workbook DNR entries | ${summary.total} |`);
lines.push(`| Public-only bridges | ${summary.publicOnly} |`);
lines.push(`| Mixed public + best-fit bridges | ${summary.mixed} |`);
lines.push(`| Exact best-fit bridges | ${summary.bestFit} |`);
lines.push(`| Lower-confidence best-fit bridges | ${summary.bestFitLower} |`);
lines.push(`| Partial / unresolved entries | ${summary.partial} |`);
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Bridge Table');
lines.push('');
lines.push('| # | Workbook DNR Entry | NPDES Permit(s) | Facility / Complex | Outfalls | GWSW Points | Confidence | Basis | Component Detail | Notes |');
lines.push('|---|---|---|---|---:|---:|---|---|---|---|');

for (const row of rows) {
  const notes = [
    row.notes.join(' '),
    row.unresolved.length ? `Unresolved component(s): ${row.unresolved.join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  lines.push(
    `| ${row.index} | ${row.dnrEntry} | ${formatSet(row.npdesPermits)} | ${formatSet(row.facilities)} | ${row.outfalls.length} | ${row.gwsw.length} | ${row.confidence} | ${formatSet(row.basis)} | ${row.componentDetail.join('; ')} | ${notes || '—'} |`,
  );
}

lines.push('');
lines.push('---');
lines.push('');
lines.push('## Entries Requiring Extra Caution');
lines.push('');
for (const row of rows.filter((item) => item.confidence !== 'PUBLIC')) {
  lines.push(`### ${row.dnrEntry}`);
  lines.push(`- Confidence: ${row.confidence}`);
  lines.push(`- Suggested bridge: ${formatSet(row.npdesPermits)}`);
  lines.push(`- Workbook coordinates sampled: ${formatSet(row.coords, 'None')}`);
  lines.push(`- Workbook outfalls: ${formatSet(row.outfalls.slice(0, 20), 'None')}${row.outfalls.length > 20 ? ` ... (${row.outfalls.length} total)` : ''}`);
  lines.push(`- Workbook GWSW points: ${formatSet(row.gwsw.slice(0, 20), 'None')}${row.gwsw.length > 20 ? ` ... (${row.gwsw.length} total)` : ''}`);
  lines.push(`- Notes: ${row.notes.join(' ') || '—'}`);
  if (row.unresolved.length) {
    lines.push(`- Unresolved components: ${row.unresolved.join(', ')}`);
  }
  lines.push('');
}

lines.push('---');
lines.push('');
lines.push('Generated for WV 2026 Outfalls workbook bridging. Verify any non-PUBLIC row against WVDEP permit files before regulatory use.');
lines.push('');

fs.writeFileSync(outputPath, `${lines.join('\n')}`);
console.log(`Wrote ${outputPath}`);
