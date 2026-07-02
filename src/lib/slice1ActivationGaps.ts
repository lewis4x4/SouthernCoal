export interface Slice1ActivationGapsReport {
  funnel: {
    distinct_violation_keys: number;
    no_permit: number;
    has_permit: number;
    has_outfall: number;
    has_parameter: number;
    has_permit_limit: number;
  };
  mirror_keys: number;
  pending_missing_internal: number;
  permits_without_federal_override: number;
  synthetic_echo_limits: number;
  top_permits_missing_limits: Array<{
    permit_number: string;
    npdes_id: string;
    missing_limit_keys: number;
  }>;
}

export function formatSlice1ActivationSummary(gaps: Slice1ActivationGapsReport): string {
  const { funnel, mirror_keys, pending_missing_internal } = gaps;
  const top = gaps.top_permits_missing_limits?.[0];
  const topHint = top
    ? ` · top limit gap: ${top.permit_number} (${top.missing_limit_keys} keys)`
    : '';
  return `${mirror_keys.toLocaleString()} mirrored / ${funnel.has_permit_limit.toLocaleString()} resolvable keys · ${pending_missing_internal.toLocaleString()} pending missing_internal${topHint}`;
}

export function buildLimitGapsCsv(gaps: Slice1ActivationGapsReport): string {
  const header = 'permit_number,npdes_id,missing_limit_keys';
  const rows = (gaps.top_permits_missing_limits ?? []).map(
    (r) => `${r.permit_number},${r.npdes_id},${r.missing_limit_keys}`,
  );
  return [header, ...rows].join('\n');
}

export function downloadLimitGapsCsv(gaps: Slice1ActivationGapsReport, filename?: string): void {
  const csv = buildLimitGapsCsv(gaps);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename ?? `slice1-limit-gaps-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
