/** MSHA OGD Violations dataset — pipe-delimited, weekly refresh (Fridays). */
export const MSHA_VIOLATIONS_ZIP_URL =
  "https://arlweb.msha.gov/OpenGovernmentData/DataSets/Violations.zip";

export const MSHA_VIOLATION_HEADERS = [
  "EVENT_NO",
  "INSPECTION_BEGIN_DT",
  "INSPECTION_END_DT",
  "VIOLATION_NO",
  "CONTROLLER_ID",
  "CONTROLLER_NAME",
  "VIOLATOR_ID",
  "VIOLATOR_NAME",
  "VIOLATOR_TYPE_CD",
  "MINE_ID",
  "MINE_NAME",
  "MINE_TYPE",
  "COAL_METAL_IND",
  "CONTRACTOR_ID",
  "VIOLATION_ISSUE_DT",
  "VIOLATION_OCCUR_DT",
  "CAL_YR",
  "CAL_QTR",
  "FISCAL_YR",
  "FISCAL_QTR",
  "VIOLATION_ISSUE_TIME",
  "SIG_SUB",
  "SECTION_OF_ACT",
  "PART_SECTION",
  "SECTION_OF_ACT_1",
  "SECTION_OF_ACT_2",
  "CIT_ORD_SAFE",
  "ORIG_TERM_DUE_DT",
  "ORIG_TERM_DUE_TIME",
  "LATEST_TERM_DUE_DT",
  "LATEST_TERM_DUE_TIME",
  "TERMINATION_DT",
  "TERMINATION_TIME",
  "TERMINATION_TYPE",
  "VACATE_DT",
  "VACATE_TIME",
  "INITIAL_VIOL_NO",
  "REPLACED_BY_ORDER_NO",
  "LIKELIHOOD",
  "INJ_ILLNESS",
  "NO_AFFECTED",
  "NEGLIGENCE",
  "WRITTEN_NOTICE",
  "ENFORCEMENT_AREA",
  "SPECIAL_ASSESS",
  "PRIMARY_OR_MILL",
  "RIGHT_TO_CONF_DT",
  "ASMT_GENERATED_IND",
  "FINAL_ORDER_ISSUE_DT",
  "PROPOSED_PENALTY",
  "AMOUNT_DUE",
  "AMOUNT_PAID",
  "BILL_PRINT_DT",
  "LAST_ACTION_CD",
  "LAST_ACTION_DT",
  "DOCKET_NO",
  "DOCKET_STATUS_CD",
  "CONTESTED_IND",
  "CONTESTED_DT",
  "VIOLATOR_VIOLATION_CNT",
  "VIOLATOR_INSPECTION_DAY_CNT",
] as const;

export type MshaViolationRow = Record<(typeof MSHA_VIOLATION_HEADERS)[number], string>;

export interface MshaViolationUpsert {
  organization_id: string;
  mine_id: string;
  event_number: string | null;
  inspection_date: string | null;
  inspection_end_date: string | null;
  inspection_type: string | null;
  violation_number: string;
  violation_type: string | null;
  section_of_act: string | null;
  significant_substantial: boolean;
  negligence: string | null;
  proposed_penalty: number | null;
  penalty_amount: number | null;
  current_status: string | null;
  violation_issue_date: string | null;
  abatement_due_date: string | null;
  termination_date: string | null;
  contested: boolean;
  raw_data: MshaViolationRow;
  synced_at: string;
}

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

export function parseMshaDate(value: string | undefined): string | null {
  const raw = stripField(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const month = match[1];
  const day = match[2];
  const year = match[3];
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseMshaNumber(value: string | undefined): number | null {
  const raw = stripField(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseMshaViolationLine(line: string): MshaViolationRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split("|");
  if (parts.length < MSHA_VIOLATION_HEADERS.length) return null;

  const row = {} as MshaViolationRow;
  for (let i = 0; i < MSHA_VIOLATION_HEADERS.length; i++) {
    const header = MSHA_VIOLATION_HEADERS[i];
    if (!header) continue;
    row[header] = stripField(parts[i]);
  }
  return row;
}

export function mapMshaViolationRow(
  row: MshaViolationRow,
  organizationId: string,
): MshaViolationUpsert | null {
  const mineId = stripField(row.MINE_ID);
  const violationNumber = stripField(row.VIOLATION_NO);
  if (!mineId || !violationNumber) return null;

  const vacated = stripField(row.VACATE_DT);
  if (vacated) return null;

  const syncedAt = new Date().toISOString();
  const proposedPenalty = parseMshaNumber(row.PROPOSED_PENALTY);
  const amountPaid = parseMshaNumber(row.AMOUNT_PAID);

  return {
    organization_id: organizationId,
    mine_id: mineId,
    event_number: stripField(row.EVENT_NO) || null,
    inspection_date: parseMshaDate(row.INSPECTION_BEGIN_DT),
    inspection_end_date: parseMshaDate(row.INSPECTION_END_DT),
    inspection_type: stripField(row.CIT_ORD_SAFE) || null,
    violation_number: violationNumber,
    violation_type: stripField(row.CIT_ORD_SAFE) || null,
    section_of_act: stripField(row.SECTION_OF_ACT) || stripField(row.SECTION_OF_ACT_1) || null,
    significant_substantial: stripField(row.SIG_SUB).toUpperCase() === "Y",
    negligence: stripField(row.NEGLIGENCE) || null,
    proposed_penalty: proposedPenalty,
    penalty_amount: amountPaid ?? parseMshaNumber(row.AMOUNT_DUE),
    current_status: stripField(row.LAST_ACTION_CD) || stripField(row.TERMINATION_TYPE) || null,
    violation_issue_date: parseMshaDate(row.VIOLATION_ISSUE_DT),
    abatement_due_date: parseMshaDate(row.LATEST_TERM_DUE_DT) ??
      parseMshaDate(row.ORIG_TERM_DUE_DT),
    termination_date: parseMshaDate(row.TERMINATION_DT),
    contested: stripField(row.CONTESTED_IND).toUpperCase() === "Y",
    raw_data: row,
    synced_at: syncedAt,
  };
}

export function isWithinLookback(issueDate: string | null, lookbackYears: number): boolean {
  if (!issueDate || lookbackYears <= 0) return true;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - lookbackYears);
  return new Date(`${issueDate}T00:00:00Z`) >= cutoff;
}
