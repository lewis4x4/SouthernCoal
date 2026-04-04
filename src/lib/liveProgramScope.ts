import type { ComplianceViolationWithRelations } from '@/types/database';
import type { FtsMonthlyTotal, FtsViolation } from '@/types/fts';

export interface LiveProgramScopeRow {
  site_id: string;
  permit_id: string | null;
  outfall_id: string | null;
  state_code: string | null;
  source_row: {
    permit_number: string | null;
    outfall_number: string | null;
    state_code: string | null;
  } | null;
}

function normalizeToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export interface LiveProgramScope {
  hasRoster: boolean;
  siteIds: Set<string>;
  permitIds: Set<string>;
  outfallIds: Set<string>;
  stateCodes: Set<string>;
  permitKeys: Set<string>;
  outfallKeys: Set<string>;
}

export function buildLiveProgramScope(rows: LiveProgramScopeRow[]): LiveProgramScope {
  const siteIds = new Set<string>();
  const permitIds = new Set<string>();
  const outfallIds = new Set<string>();
  const stateCodes = new Set<string>();
  const permitKeys = new Set<string>();
  const outfallKeys = new Set<string>();

  rows.forEach((row) => {
    siteIds.add(row.site_id);
    if (row.permit_id) permitIds.add(row.permit_id);
    if (row.outfall_id) outfallIds.add(row.outfall_id);

    const stateCode = normalizeToken(row.state_code ?? row.source_row?.state_code);
    if (stateCode) stateCodes.add(stateCode);

    const permitNumber = normalizeToken(row.source_row?.permit_number);
    const outfallNumber = normalizeToken(row.source_row?.outfall_number);

    if (stateCode && permitNumber) {
      permitKeys.add(`${stateCode}|${permitNumber}`);
      if (outfallNumber) {
        outfallKeys.add(`${stateCode}|${permitNumber}|${outfallNumber}`);
      }
    }
  });

  return {
    hasRoster: rows.length > 0,
    siteIds,
    permitIds,
    outfallIds,
    stateCodes,
    permitKeys,
    outfallKeys,
  };
}

export function complianceViolationInScope(
  violation: ComplianceViolationWithRelations,
  scope: LiveProgramScope,
): boolean {
  if (!scope.hasRoster) return true;
  if (violation.outfall_id && scope.outfallIds.has(violation.outfall_id)) return true;
  if (violation.permit_id && scope.permitIds.has(violation.permit_id)) return true;
  if (violation.site_id && scope.siteIds.has(violation.site_id)) return true;
  return false;
}

export function ftsViolationInScope(
  violation: FtsViolation,
  scope: LiveProgramScope,
): boolean {
  if (!scope.hasRoster) return true;

  const state = normalizeToken(violation.state);
  const permit = normalizeToken(violation.dnr_number);
  const outfall = normalizeToken(violation.outfall_number);

  if (state && permit && outfall && scope.outfallKeys.has(`${state}|${permit}|${outfall}`)) {
    return true;
  }

  if (state && permit && scope.permitKeys.has(`${state}|${permit}`)) {
    return true;
  }

  if (state && scope.stateCodes.has(state)) {
    return true;
  }

  return false;
}

export function ftsMonthlyTotalInScope(
  total: FtsMonthlyTotal,
  scope: LiveProgramScope,
): boolean {
  if (!scope.hasRoster) return true;
  const state = normalizeToken(total.state);
  return state ? scope.stateCodes.has(state) : false;
}
