/**
 * MSHA abatement discrepancy rules — shared by detect-discrepancies Edge Function
 * and Vitest (Lane C). DRAFT operational aids only — not legal conclusions.
 */

export interface MshaCitationInput {
  id: string;
  mine_id: string;
  violation_number: string;
  event_number: string | null;
  inspection_date: string | null;
  violation_issue_date: string | null;
  abatement_due_date: string | null;
  termination_date: string | null;
  significant_substantial: boolean;
  contested: boolean;
  current_status: string | null;
  proposed_penalty: number | null;
}

export interface MshaDiscrepancyCandidate {
  external_source_id: string;
  mine_id: string;
  discrepancy_type: "status_mismatch";
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  internal_value: string | null;
  external_value: string;
  monitoring_period_start: string | null;
  monitoring_period_end: string | null;
  rule_id: "msha_abatement_overdue" | "msha_abatement_due_soon" | "msha_ss_open";
}

export interface EvaluateMshaOptions {
  today?: Date;
  daysAhead?: number;
}

function parseDateOnly(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function evaluateMshaCitation(
  row: MshaCitationInput,
  options: EvaluateMshaOptions = {},
): MshaDiscrepancyCandidate | null {
  if (row.termination_date) return null;

  const today = options.today ?? new Date();
  const todayDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const daysAhead = options.daysAhead ?? 14;
  const abatementDue = parseDateOnly(row.abatement_due_date);
  const status = String(row.current_status ?? "Open").trim();
  const periodStart = row.violation_issue_date ?? row.inspection_date;
  const periodEnd = row.abatement_due_date;

  const externalValue = [
    `status=${status}`,
    row.abatement_due_date ? `abatement_due=${row.abatement_due_date}` : null,
    row.significant_substantial ? "S&S" : null,
    row.contested ? "contested" : null,
  ]
    .filter(Boolean)
    .join("; ");

  if (abatementDue) {
    const daysUntil = daysBetween(todayDate, abatementDue);

    if (daysUntil < 0) {
      const daysLate = Math.abs(daysUntil);
      const severity = row.significant_substantial ? "critical" : "high";
      return {
        external_source_id: row.id,
        mine_id: row.mine_id,
        discrepancy_type: "status_mismatch",
        severity,
        description:
          `MSHA citation ${row.violation_number} on mine ${row.mine_id} is ${daysLate} day(s) past abatement due ` +
          `(${row.abatement_due_date})${row.significant_substantial ? " — S&S" : ""}` +
          `${row.contested ? " — contested" : ""}`,
        internal_value: null,
        external_value: externalValue,
        monitoring_period_start: periodStart,
        monitoring_period_end: periodEnd,
        rule_id: "msha_abatement_overdue",
      };
    }

    if (daysUntil <= daysAhead) {
      const severity = row.significant_substantial ? "high" : "medium";
      return {
        external_source_id: row.id,
        mine_id: row.mine_id,
        discrepancy_type: "status_mismatch",
        severity,
        description:
          `MSHA citation ${row.violation_number} on mine ${row.mine_id} abatement due in ${daysUntil} day(s) ` +
          `(${row.abatement_due_date})${row.significant_substantial ? " — S&S" : ""}`,
        internal_value: null,
        external_value: externalValue,
        monitoring_period_start: periodStart,
        monitoring_period_end: periodEnd,
        rule_id: "msha_abatement_due_soon",
      };
    }
  }

  if (row.significant_substantial) {
    return {
      external_source_id: row.id,
      mine_id: row.mine_id,
      discrepancy_type: "status_mismatch",
      severity: "high",
      description:
        `Open S&S MSHA citation ${row.violation_number} on mine ${row.mine_id} — verify abatement plan`,
      internal_value: null,
      external_value: externalValue,
      monitoring_period_start: periodStart,
      monitoring_period_end: periodEnd,
      rule_id: "msha_ss_open",
    };
  }

  return null;
}

export function evaluateMshaCitations(
  rows: MshaCitationInput[],
  options: EvaluateMshaOptions = {},
): MshaDiscrepancyCandidate[] {
  const results: MshaDiscrepancyCandidate[] = [];
  for (const row of rows) {
    const candidate = evaluateMshaCitation(row, options);
    if (candidate) results.push(candidate);
  }
  return results;
}

/** Stable reference date for tests. */
export const MSHA_DISCREPANCY_TEST_TODAY = "2026-07-01";
