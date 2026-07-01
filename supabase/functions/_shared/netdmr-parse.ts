/**
 * Shared NetDMR CSV/ZIP parsing — used by import-netdmr-dmr for full-file re-parse.
 */
import { BlobReader, BlobWriter, ZipReader } from "https://esm.sh/@zip.js/zip.js@2.7.32";

export interface NetDmrRow {
  rowNumber: number;
  permitNumber: string;
  outfallId: string;
  monitoringPeriodStart: string | null;
  monitoringPeriodEnd: string | null;
  parameterCode: string;
  parameterDesc: string;
  statisticalBase: string;
  limitValue: number | null;
  limitUnit: string;
  measuredValue: number | null;
  measuredUnit: string;
  nodiCode: string | null;
  sampleCount: number | null;
  exceedancePct: number | null;
  isExceedance: boolean;
}

const STORET_MAP: Record<string, string> = {
  "01046": "Iron, Dissolved",
  "01045": "Iron, Total",
  "01056": "Manganese, Dissolved",
  "01055": "Manganese, Total",
  "01147": "Selenium, Dissolved",
  "01145": "Selenium, Total",
  "01105": "Aluminum, Dissolved",
  "01106": "Aluminum, Total",
  "00400": "pH",
  "00010": "Temperature",
  "00530": "Total Suspended Solids",
  "00545": "Settleable Solids",
  "70300": "Total Dissolved Solids",
  "00310": "BOD",
  "00300": "Dissolved Oxygen",
  "00076": "Turbidity",
  "00094": "Specific Conductance",
  "00095": "Conductivity",
  "00061": "Flow, Instantaneous",
  "00060": "Flow, Average",
  "00610": "Ammonia",
  "00630": "Nitrate+Nitrite",
  "00665": "Phosphorus, Total",
  "00945": "Sulfate",
  "00940": "Chloride",
  "00410": "Alkalinity",
  "00435": "Acidity",
  "00556": "Oil & Grease",
  "00916": "Calcium",
  "00927": "Magnesium",
  "00929": "Sodium",
  "00937": "Potassium",
  "00900": "Hardness",
};

const NO_DATA_CODES = new Set(["C", "9", "N", "R", "U", "W"]);

function isNoDataCode(code: string | null): boolean {
  return code !== null && NO_DATA_CODES.has(code.toUpperCase());
}

const STAT_BASE_MAP: Record<string, string> = {
  "01": "minimum",
  "02": "average",
  "03": "maximum",
  "04": "daily_maximum",
  "05": "weekly_average",
  "06": "monthly_average",
  "07": "instantaneous",
  "30": "sample_measurement",
};

function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const match = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const [, mm, dd, yyyy] = match;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];

  return null;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }

  result.push(current.trim());
  return result;
}

export function parseNetDmrCsv(
  content: string,
  fileName: string,
): { rows: NetDmrRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const rows: NetDmrRow[] = [];

  const lines = content.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length === 0) {
    warnings.push(`${fileName}: Empty file`);
    return { rows, warnings };
  }

  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes("permit") || firstLine.includes("npdes");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const cols = parseCSVLine(line);

    if (cols.length < 15) continue;

    const permitNumber = cols[0]?.trim() ?? "";
    const outfallId = cols[2]?.trim() ?? "";
    const periodStart = parseDate(cols[3]);
    const periodEnd = parseDate(cols[4]);
    const paramCode = cols[5]?.trim() ?? "";
    const paramDesc = cols[6]?.trim() ?? "";
    const statBaseCode = cols[7]?.trim() ?? "";
    const limitValueRaw = cols[8]?.trim() ?? "";
    const limitUnit = cols[9]?.trim() ?? "";
    const measuredValueRaw = cols[10]?.trim() ?? "";
    const measuredUnit = cols[11]?.trim() ?? "";
    const nodiCode = cols[12]?.trim() || null;
    const exceedancePctRaw = cols[14]?.trim() ?? "";

    if (!permitNumber || !paramCode) continue;

    const limitValue = limitValueRaw ? parseFloat(limitValueRaw) : null;
    const measuredValue = measuredValueRaw ? parseFloat(measuredValueRaw) : null;
    const exceedancePct = exceedancePctRaw ? parseFloat(exceedancePctRaw) : null;
    const statisticalBase = STAT_BASE_MAP[statBaseCode] ?? "sample_measurement";

    let isExceedance = false;
    if (
      !isNoDataCode(nodiCode) &&
      measuredValue !== null &&
      limitValue !== null &&
      limitValue > 0
    ) {
      isExceedance = measuredValue > limitValue;
    }

    rows.push({
      rowNumber: i + (hasHeader ? 2 : 1),
      permitNumber,
      outfallId,
      monitoringPeriodStart: periodStart,
      monitoringPeriodEnd: periodEnd,
      parameterCode: paramCode,
      parameterDesc: paramDesc || STORET_MAP[paramCode] || paramCode,
      statisticalBase,
      limitValue: isNaN(limitValue ?? NaN) ? null : limitValue,
      limitUnit,
      measuredValue: isNaN(measuredValue ?? NaN) ? null : measuredValue,
      measuredUnit,
      nodiCode,
      sampleCount: null,
      exceedancePct: isNaN(exceedancePct ?? NaN) ? null : exceedancePct,
      isExceedance,
    });
  }

  return { rows, warnings };
}

/** Parse all DMR rows from a storage blob (ZIP of CSVs or single CSV). */
export async function extractAllNetDmrRowsFromBlob(
  fileData: Blob,
  fileName: string,
): Promise<{ rows: NetDmrRow[]; warnings: string[] }> {
  const allRows: NetDmrRow[] = [];
  const allWarnings: string[] = [];

  const isZip =
    fileName.toLowerCase().endsWith(".zip") ||
    fileData.type === "application/zip";

  if (isZip) {
    const zipReader = new ZipReader(new BlobReader(fileData));
    const entries = await zipReader.getEntries();

    for (const entry of entries) {
      if (entry.directory) continue;

      const name = entry.filename.toLowerCase();
      if (!name.endsWith(".csv") && !name.endsWith(".txt")) continue;

      const writer = new BlobWriter();
      const blob = await entry.getData?.(writer);
      if (!blob) continue;

      const text = await blob.text();
      const { rows, warnings } = parseNetDmrCsv(text, entry.filename);
      allRows.push(...rows);
      allWarnings.push(...warnings);
    }

    await zipReader.close();
  } else {
    const text = await fileData.text();
    const { rows, warnings } = parseNetDmrCsv(text, fileName);
    allRows.push(...rows);
    allWarnings.push(...warnings);
  }

  return { rows: allRows, warnings: allWarnings };
}
