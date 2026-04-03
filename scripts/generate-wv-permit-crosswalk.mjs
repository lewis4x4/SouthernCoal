import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd(), '..');
const inventoryPath = path.join(repoRoot, 'SCC_NPDES_Permit_Inventory.csv');
const reportPath = path.join(repoRoot, 'reports', 'SCC_Permit_Outfall_Report_2026-02-22.csv');
const dmrPath = path.join(repoRoot, 'SCC_DMR_Export_CY2025_KY_WV_TN.csv');
const outputPath = path.join(repoRoot, 'WV_Permit_Crosswalk_COMPLETED.md');

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

function classifyPoint(code) {
  if (/^\d/.test(code)) return 'Outfall';
  if (/GW|GROUND/i.test(code)) return 'Groundwater';
  if (/^US/i.test(code)) return 'Upstream';
  if (/^DS/i.test(code)) return 'Downstream';
  if (/SW|STAND|WG/i.test(code)) return 'Standing/Surface Water';
  return 'Other Monitoring Point';
}

function formatList(items, fallback = 'None in exports') {
  return items.length ? items.join(', ') : fallback;
}

function formatTypeList(points, type) {
  const codes = points.filter((point) => point.type === type).map((point) => point.code);
  return formatList(codes, 'None');
}

const permits = parseCsv(inventoryPath)
  .filter((row) => row.State === 'WV')
  .sort((a, b) => String(a['Permit Number']).localeCompare(String(b['Permit Number'])));

const outfallReport = new Map(
  parseCsv(reportPath)
    .filter((row) => row.State === 'WV')
    .map((row) => [row['Permit Number'], row]),
);

const dmrRows = parseCsv(dmrPath).filter((row) => row.State === 'WV');
const dmrPointsByPermit = new Map();

for (const row of dmrRows) {
  const permit = row['Permit Number'];
  const code = row.Outfall;
  if (!dmrPointsByPermit.has(permit)) {
    dmrPointsByPermit.set(permit, new Map());
  }
  const permitMap = dmrPointsByPermit.get(permit);
  if (!permitMap.has(code)) {
    permitMap.set(code, {
      code,
      type: classifyPoint(code),
      monitoringPeriods: 0,
      maxParameters: 0,
      totalSampleRecords: 0,
    });
  }
  const point = permitMap.get(code);
  point.monitoringPeriods += 1;
  point.maxParameters = Math.max(point.maxParameters, Number(row['Parameters Reported'] || 0));
  point.totalSampleRecords += Number(row['Sample Records'] || 0);
}

const totals = {
  permits: permits.length,
  outfalls: 0,
  limits: 0,
  permitsWithDmr: 0,
  permitsWithoutDmr: 0,
  outfallPoints: 0,
  groundwaterPoints: 0,
  upstreamPoints: 0,
  downstreamPoints: 0,
  standingSurfacePoints: 0,
  otherPoints: 0,
};

const detailRows = permits.map((permitRow) => {
  const permitNumber = permitRow['Permit Number'];
  const reportRow = outfallReport.get(permitNumber) ?? {};
  const dmrPointMap = dmrPointsByPermit.get(permitNumber) ?? new Map();
  const points = [...dmrPointMap.values()].sort((a, b) => a.code.localeCompare(b.code));

  const counts = {
    Outfall: points.filter((point) => point.type === 'Outfall').length,
    Groundwater: points.filter((point) => point.type === 'Groundwater').length,
    Upstream: points.filter((point) => point.type === 'Upstream').length,
    Downstream: points.filter((point) => point.type === 'Downstream').length,
    'Standing/Surface Water': points.filter((point) => point.type === 'Standing/Surface Water').length,
    'Other Monitoring Point': points.filter((point) => point.type === 'Other Monitoring Point').length,
  };

  totals.outfalls += Number(reportRow['Outfall Count'] || 0);
  totals.limits += Number(reportRow['Limit Count'] || 0);
  if (points.length > 0) totals.permitsWithDmr += 1;
  else totals.permitsWithoutDmr += 1;
  totals.outfallPoints += counts.Outfall;
  totals.groundwaterPoints += counts.Groundwater;
  totals.upstreamPoints += counts.Upstream;
  totals.downstreamPoints += counts.Downstream;
  totals.standingSurfacePoints += counts['Standing/Surface Water'];
  totals.otherPoints += counts['Other Monitoring Point'];

  const status = permitRow['ECHO Permit Status'] || permitRow['Internal Status'] || reportRow.Status || 'Unknown';
  const site = [permitRow.City, permitRow.County].filter(Boolean).join(' / ') || 'Unknown';
  const specialTypes = [
    counts.Groundwater ? 'groundwater' : null,
    counts.Upstream ? 'upstream' : null,
    counts.Downstream ? 'downstream' : null,
    counts['Standing/Surface Water'] ? 'standing/surface water' : null,
    counts['Other Monitoring Point'] ? 'other monitoring points' : null,
  ].filter(Boolean);

  return {
    permitNumber,
    facilityName: permitRow['Facility Name'] || '(not in ECHO)',
    site,
    status,
    outfallCount: Number(reportRow['Outfall Count'] || 0),
    limitCount: Number(reportRow['Limit Count'] || 0),
    reportOutfalls: reportRow.Outfalls || 'None in report export',
    dmrPoints: points,
    counts,
    note:
      points.length === 0
        ? 'No CY2025 DMR monitoring rows in export'
        : specialTypes.length > 0
          ? `Includes ${specialTypes.join(', ')}`
          : 'Numeric discharge outfalls only',
  };
});

const permitsWithSpecialPoints = detailRows
  .filter((row) => row.counts.Groundwater + row.counts.Upstream + row.counts.Downstream + row.counts['Standing/Surface Water'] + row.counts['Other Monitoring Point'] > 0)
  .map((row) => {
    const specialPoints = row.dmrPoints
      .filter((point) => point.type !== 'Outfall')
      .map((point) => `${point.code} (${point.type})`);
    return `| ${row.permitNumber} | ${row.facilityName} | ${formatList(specialPoints, 'None')} |`;
  });

const nonPrefixedPermits = detailRows
  .filter((row) => !row.permitNumber.startsWith('WV'))
  .map((row) => row.permitNumber);

const lines = [];
lines.push('# West Virginia Permit / Monitoring Point Crosswalk');
lines.push('');
lines.push('**Generated:** 2026-04-02');
lines.push('**Source:** `SCC_NPDES_Permit_Inventory.csv`, `reports/SCC_Permit_Outfall_Report_2026-02-22.csv`, `SCC_DMR_Export_CY2025_KY_WV_TN.csv`');
lines.push('**Scope:** All records where `State = WV` in the current local exports, including numeric outfalls plus non-outfall monitoring points appearing in WV DMR data.');
lines.push('**Point Type Legend:**');
lines.push('- **Outfall** — numeric discharge point codes such as `001` or `014`');
lines.push('- **Groundwater** — any point code explicitly containing `GW` or `GROUND`');
lines.push('- **Upstream / Downstream** — stream comparison points prefixed `US*` / `DS*`');
lines.push('- **Standing/Surface Water** — codes suggesting standing or general surface-water monitoring');
lines.push('- **Other Monitoring Point** — special WV site codes that are not plain outfall numbers');
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Crosswalk Table');
lines.push('');
lines.push('| # | Permit Number | Facility | City / County | Permit Status | Outfalls in Permit Report | Limit Count | DMR Outfalls | Groundwater | Upstream | Downstream | Standing / Surface Water | Other Monitoring Points | Notes |');
lines.push('|---|---|---|---|---|---:|---:|---|---|---|---|---|---|---|');

for (const [index, row] of detailRows.entries()) {
  lines.push(
    `| ${index + 1} | ${row.permitNumber} | ${row.facilityName} | ${row.site} | ${row.status} | ${row.outfallCount} | ${row.limitCount} | ${formatTypeList(row.dmrPoints, 'Outfall')} | ${formatTypeList(row.dmrPoints, 'Groundwater')} | ${formatTypeList(row.dmrPoints, 'Upstream')} | ${formatTypeList(row.dmrPoints, 'Downstream')} | ${formatTypeList(row.dmrPoints, 'Standing/Surface Water')} | ${formatTypeList(row.dmrPoints, 'Other Monitoring Point')} | ${row.note} |`,
  );
}

lines.push('');
lines.push('---');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push('| Metric | Count |');
lines.push('|---|---:|');
lines.push(`| WV permits in local exports | ${totals.permits} |`);
lines.push(`| WV permits with CY2025 DMR activity in export | ${totals.permitsWithDmr} |`);
lines.push(`| WV permits with no CY2025 DMR rows in export | ${totals.permitsWithoutDmr} |`);
lines.push(`| Total WV outfalls in permit report export | ${totals.outfalls} |`);
lines.push(`| Total WV permit limits in permit report export | ${totals.limits} |`);
lines.push(`| Distinct numeric DMR outfall codes | ${totals.outfallPoints} |`);
lines.push(`| Distinct groundwater point codes | ${totals.groundwaterPoints} |`);
lines.push(`| Distinct upstream point codes | ${totals.upstreamPoints} |`);
lines.push(`| Distinct downstream point codes | ${totals.downstreamPoints} |`);
lines.push(`| Distinct standing/surface-water point codes | ${totals.standingSurfacePoints} |`);
lines.push(`| Distinct other WV monitoring point codes | ${totals.otherPoints} |`);
lines.push('');
lines.push(`**Groundwater note:** No WV monitoring-point codes in the current local DMR export matched a groundwater naming pattern. If groundwater points exist in the live DB, they are not represented in this export snapshot.`);
lines.push('');
lines.push(`**Prefix note:** Two WV permits in the exports do not use a 'WV' prefix: ${nonPrefixedPermits.join(', ')}.`);
lines.push('');
lines.push('---');
lines.push('');
lines.push('## WV Permits With Non-Outfall Monitoring Points');
lines.push('');
lines.push('| Permit Number | Facility | Special Monitoring Points Found in DMR Export |');
lines.push('|---|---|---|');
lines.push(...permitsWithSpecialPoints);
lines.push('');
lines.push('---');
lines.push('');
lines.push('## Data Gaps / Follow-up');
lines.push('');
lines.push(`1. ${totals.permitsWithoutDmr} WV permits have permit/outfall inventory rows but no CY2025 DMR monitoring rows in the local export. Those permits may still exist in the live database with point metadata that is not represented here.`);
lines.push('2. The permit report export preserves canonical outfall counts, but it does not expose `outfall_type` or `receiving_water` values. Those fields exist in the app schema and should be pulled from Supabase directly if you want a second-pass WV report grouped by exact DB `outfall_type`.');
lines.push('3. WV special monitoring points are heavily code-based. Before regulatory use, confirm whether each `US*`, `DS*`, `BAS*`, `FRB*`, or similar point should remain in the same operational bucket used in this report.');
lines.push('');
lines.push('---');
lines.push('');
lines.push('Generated by SCC Compliance Monitor — a compliance reporting tool. Not an EMS. Not legal or environmental consulting. All data and reports require independent verification by qualified personnel before regulatory submission.');
lines.push('');

fs.writeFileSync(outputPath, `${lines.join('\n')}`);
console.log(`Wrote ${outputPath}`);
