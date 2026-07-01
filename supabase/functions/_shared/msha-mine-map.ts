/** MSHA OGD Mines dataset — pipe-delimited, weekly refresh. */
export const MSHA_MINES_ZIP_URL =
  "https://arlweb.msha.gov/OpenGovernmentData/DataSets/Mines.zip";

export const MSHA_MINE_HEADERS = [
  "MINE_ID",
  "CURRENT_MINE_NAME",
  "COAL_METAL_IND",
  "CURRENT_MINE_TYPE",
  "CURRENT_MINE_STATUS",
  "CURRENT_STATUS_DT",
  "CURRENT_CONTROLLER_ID",
  "CURRENT_CONTROLLER_NAME",
  "CURRENT_OPERATOR_ID",
  "CURRENT_OPERATOR_NAME",
  "STATE",
] as const;

export type MshaMineRow = Record<(typeof MSHA_MINE_HEADERS)[number], string>;

export interface SubsidiaryOrgRow {
  subsidiary_name: string;
  organization_id: string;
  normalized_name: string;
}

export interface ParsedMineRecord {
  mine_id: string;
  mine_name: string;
  state: string;
  mine_status: string;
  controller_id: string;
  controller_name: string;
  operator_name: string;
  coal_metal_ind: string;
}

export interface MapRefreshStats {
  scanned: number;
  justice_coal: number;
  mapped: number;
  review: number;
  deactivated: number;
  overrides_applied: number;
}

const LEGAL_SUFFIXES = [
  "INCORPORATED",
  "CORPORATION",
  "HOLDINGS",
  "RECLAMATION",
  "DEVELOPMENT",
  "COMPANY",
  "L L C",
  "LLC",
  "INC",
  "CORP",
  "CO",
  "LP",
  "LLP",
  "LTD",
];

/** Curated operator aliases → normalized subsidiary key */
export const OPERATOR_ALIAS_TO_NORMALIZED: Record<string, string> = {
  "VIRGINIA FUELS": "VIRGINIA FUEL",
  "KENTUCKY FUEL PAINTSVILLE": "KENTUCKY FUEL",
};

export function stripField(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function normalizeOrgName(name: string): string {
  let value = stripField(name).toUpperCase();
  value = value.replace(/&/g, " AND ");
  value = value.replace(/[.,]/g, " ");
  for (const suffix of LEGAL_SUFFIXES) {
    const pattern = new RegExp(`\\b${suffix}\\b`, "g");
    value = value.replace(pattern, " ");
  }
  value = value.replace(/\s+/g, " ").trim();
  return value;
}

export function parseMshaMineLine(line: string): MshaMineRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split("|");
  if (parts.length < MSHA_MINE_HEADERS.length) return null;
  const row = {} as MshaMineRow;
  for (let i = 0; i < MSHA_MINE_HEADERS.length; i++) {
    const header = MSHA_MINE_HEADERS[i];
    if (!header) continue;
    row[header] = stripField(parts[i]);
  }
  return row;
}

export function toParsedMineRecord(row: MshaMineRow): ParsedMineRecord {
  return {
    mine_id: stripField(row.MINE_ID),
    mine_name: stripField(row.CURRENT_MINE_NAME),
    state: stripField(row.STATE),
    mine_status: stripField(row.CURRENT_MINE_STATUS),
    controller_id: stripField(row.CURRENT_CONTROLLER_ID),
    controller_name: stripField(row.CURRENT_CONTROLLER_NAME),
    operator_name: stripField(row.CURRENT_OPERATOR_NAME),
    coal_metal_ind: stripField(row.COAL_METAL_IND),
  };
}

export function isJusticeController(
  controllerId: string,
  allowlist: Set<string>,
): boolean {
  const normalized = stripField(controllerId).toUpperCase();
  return allowlist.has(normalized) || allowlist.has(stripField(controllerId));
}

export function resolveOperatorToOrgId(
  operatorName: string,
  subsidiaries: SubsidiaryOrgRow[],
): string | null {
  let normalized = normalizeOrgName(operatorName);
  const alias = OPERATOR_ALIAS_TO_NORMALIZED[normalized];
  if (alias) {
    normalized = alias;
  }

  for (const sub of subsidiaries) {
    if (sub.normalized_name === normalized) {
      return sub.organization_id;
    }
  }
  return null;
}

export function buildMineIdMapFromRows(
  rows: { mine_id: string; organization_id: string }[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.mine_id] = row.organization_id;
  }
  return map;
}
