/**
 * Task 3.35 prep — assess whether internal data exists for meaningful discrepancy detection.
 * Pure logic; counts supplied by useDiscrepancyReadiness.
 */

export interface DiscrepancyReadinessCounts {
  echoFacilities: number;
  echoViolations: number;
  internalPermits: number;
  exceedances: number;
  dmrSubmissions: number;
  dmrLineItems: number;
  mshaOpenCitations: number;
}

export type DiscrepancyReadinessLevel = 'blocked' | 'echo_only' | 'partial' | 'ready';

export type DiscrepancyRuleStatus = 'blocked' | 'degraded' | 'ready';

export interface DiscrepancyRuleGate {
  id: 'echo_sync' | 'rule1' | 'rule2' | 'rule3' | 'msha_abatement';
  label: string;
  status: DiscrepancyRuleStatus;
  summary: string;
  recommendation: string;
}

export interface DiscrepancyReadinessAssessment {
  overall: DiscrepancyReadinessLevel;
  gates: DiscrepancyRuleGate[];
  /** True when Rule 1+2 or Rule 3 can produce actionable (not all missing_internal) results. */
  canRunMeaningfulDetection: boolean;
  /** True when open MSHA citations exist for abatement discrepancy rules. */
  canRunMshaDetection: boolean;
  headline: string;
}

export function assessDiscrepancyDetectionReadiness(
  counts: DiscrepancyReadinessCounts,
): DiscrepancyReadinessAssessment {
  const gates: DiscrepancyRuleGate[] = [];

  const echoSynced = counts.echoFacilities > 0;

  gates.push({
    id: 'echo_sync',
    label: 'ECHO external data',
    status: echoSynced ? 'ready' : 'blocked',
    summary: echoSynced
      ? `${counts.echoFacilities.toLocaleString()} ECHO facilities synced`
      : 'No ECHO facility rows — sync external data first',
    recommendation: echoSynced
      ? 'ECHO sync complete for facility coverage'
      : 'Run Sync ECHO on External Data or Review Queue',
  });

  const rule1Status: DiscrepancyRuleStatus = !echoSynced
    ? 'blocked'
    : counts.internalPermits > 0
      ? 'ready'
      : 'degraded';

  gates.push({
    id: 'rule1',
    label: 'Rule 1 — Permit status + SNC',
    status: rule1Status,
    summary:
      counts.internalPermits > 0
        ? `${counts.internalPermits.toLocaleString()} internal permits for status compare`
        : 'No npdes_permits — status mismatches and SNC checks limited',
    recommendation:
      counts.internalPermits > 0
        ? counts.exceedances > 0
          ? 'Permits + exceedances present for SNC tracking'
          : 'Upload exceedances or lab data so SNC gaps are actionable'
        : 'Upload NPDES permits via /compliance Upload Dashboard',
  });

  const rule2Status: DiscrepancyRuleStatus = !echoSynced
    ? 'blocked'
    : counts.exceedances > 0
      ? 'ready'
      : 'degraded';

  gates.push({
    id: 'rule2',
    label: 'Rule 2 — ECHO violations vs internal',
    status: rule2Status,
    summary:
      counts.echoViolations > 0
        ? `${counts.echoViolations.toLocaleString()} ECHO DMR rows with violation codes`
        : 'No ECHO violation rows (or not synced yet)',
    recommendation:
      counts.exceedances > 0
        ? `${counts.exceedances.toLocaleString()} internal exceedances — re-run can triage Rule 2`
        : 'Without exceedances/lab imports, Rule 2 fires missing_internal for every ECHO violation',
  });

  const rule3Status: DiscrepancyRuleStatus =
    counts.dmrSubmissions > 0 && counts.dmrLineItems > 0
      ? 'ready'
      : counts.dmrSubmissions > 0 || counts.dmrLineItems > 0
        ? 'degraded'
        : 'blocked';

  gates.push({
    id: 'rule3',
    label: 'Rule 3 — DMR value mismatch (>10%)',
    status: rule3Status,
    summary:
      counts.dmrLineItems > 0
        ? `${counts.dmrSubmissions.toLocaleString()} submissions · ${counts.dmrLineItems.toLocaleString()} line items`
        : 'No dmr_line_items — Rule 3 skipped until DMR pipeline populated',
    recommendation:
      rule3Status === 'ready'
        ? 'Internal DMR line items ready for ECHO cross-check'
        : 'Import NetDMR CSV or Justice EDD → DMR pipeline via /compliance',
  });

  const mshaStatus: DiscrepancyRuleStatus =
    counts.mshaOpenCitations > 0 ? 'ready' : 'blocked';

  gates.push({
    id: 'msha_abatement',
    label: 'MSHA — Abatement at risk',
    status: mshaStatus,
    summary:
      counts.mshaOpenCitations > 0
        ? `${counts.mshaOpenCitations.toLocaleString()} open MSHA citations for abatement rules`
        : 'No open MSHA citations — sync violations on External Data first',
    recommendation:
      counts.mshaOpenCitations > 0
        ? 'Run MSHA detection to queue overdue / due-soon abatement rows'
        : 'Sync MSHA violations or seed UAT citations for smoke testing',
  });

  const rule1Ready = rule1Status === 'ready';
  const rule2Ready = rule2Status === 'ready';
  const rule3Ready = rule3Status === 'ready';

  const overall: DiscrepancyReadinessLevel = !echoSynced
    ? 'blocked'
    : rule1Ready && (rule2Ready || rule3Ready)
      ? 'ready'
      : rule1Ready || counts.internalPermits > 0 || counts.dmrSubmissions > 0
        ? 'partial'
        : 'echo_only';

  const canRunMeaningfulDetection = rule1Ready && (rule2Ready || rule3Ready);
  const canRunMshaDetection = counts.mshaOpenCitations > 0;

  const headline =
    overall === 'ready'
      ? 'Detection complete — triage pending rows; status_mismatch rows warrant human review first'
      : overall === 'partial'
        ? 'Partial internal data — detection runs but most Rule 2 rows stay missing_internal'
        : overall === 'echo_only'
          ? 'ECHO-only — Run Detection works but compares against empty internal tables'
          : 'Sync ECHO data before running detection';

  return { overall, gates, canRunMeaningfulDetection, canRunMshaDetection, headline };
}
