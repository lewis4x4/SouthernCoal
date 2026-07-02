import type {
  DmrLineItem,
  DmrLineItemWithRelations,
  DmrSubmission,
  DmrSubmissionType,
  DmrSubmissionStatus,
  NodiCode,
} from '@/types/database';

export interface DmrSubmissionWithPermit extends DmrSubmission {
  permit_number?: string;
  federal_npdes_id?: string | null;
  site_name?: string;
}

export interface DmrCalculationWarning {
  type: string;
  message: string;
  from_unit?: string;
  to_unit?: string;
  parameter_id?: string;
}

/** Production CMS uses reporting_period_* / dmr_submission_id / concentration_* columns. */
export function isCmsDmrRow(row: Record<string, unknown>): boolean {
  return 'reporting_period_start' in row || 'dmr_submission_id' in row;
}

export function mapDmrSubmissionRow(
  row: Record<string, unknown>,
  permit?: Record<string, unknown> | null,
): DmrSubmissionWithPermit {
  const permitRow = permit ?? (row.permit as Record<string, unknown> | null);
  const site = permitRow?.site as Record<string, unknown> | null;
  const meta = permitRow?.metadata as Record<string, unknown> | null;
  const federal = (meta?.federal_npdes_id_override as string | undefined)?.trim() || null;

  const periodStart =
    (row.monitoring_period_start as string | undefined) ??
    (row.reporting_period_start as string | undefined) ??
    '';
  const periodEnd =
    (row.monitoring_period_end as string | undefined) ??
    (row.reporting_period_end as string | undefined) ??
    '';

  const submissionType =
    (row.submission_type as DmrSubmissionType | undefined) ??
    ((row.reporting_frequency as string | undefined) === 'quarterly'
      ? 'quarterly'
      : (row.reporting_frequency as string | undefined) === 'annual'
        ? 'annual'
        : 'monthly');

  const orgId =
    (row.organization_id as string | undefined) ??
    (permitRow?.organization_id as string | undefined) ??
    '';

  return {
    id: row.id as string,
    organization_id: orgId,
    permit_id: row.permit_id as string,
    monitoring_period_start: periodStart,
    monitoring_period_end: periodEnd,
    submission_type: submissionType,
    status: row.status as DmrSubmissionStatus,
    no_discharge: Boolean(row.no_discharge),
    nodi_code: (row.nodi_code as NodiCode | null) ?? null,
    submitted_by: (row.submitted_by as string | null) ?? null,
    submitted_at: (row.submitted_at as string | null) ?? (row.submitted_date as string | null) ?? null,
    submission_confirmation:
      (row.submission_confirmation as string | null) ??
      (row.confirmation_number as string | null) ??
      null,
    source_file_id: (row.source_file_id as string | null) ?? null,
    import_id: (row.import_id as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    permit_number: (permitRow?.permit_number as string) ?? undefined,
    federal_npdes_id: federal,
    site_name: (site?.name as string) ?? undefined,
  } as DmrSubmissionWithPermit;
}

export function mapDmrLineItemUpdatesToDb(
  updates: Partial<Pick<DmrLineItem, 'measured_value' | 'measured_unit' | 'nodi_code' | 'qualifier' | 'comments'>>,
  cms: boolean,
): Record<string, unknown> {
  const dbUpdates: Record<string, unknown> = { ...updates };

  if (cms) {
    if ('measured_value' in updates) {
      dbUpdates.concentration_max = updates.measured_value;
      delete dbUpdates.measured_value;
    }
    if ('measured_unit' in updates) {
      dbUpdates.concentration_units = updates.measured_unit;
      delete dbUpdates.measured_unit;
    }
    if ('comments' in updates) {
      dbUpdates.exemption_notes = updates.comments;
      delete dbUpdates.comments;
    }
  }

  return dbUpdates;
}

export function mapDmrLineItemRow(row: Record<string, unknown>): DmrLineItemWithRelations & {
  calculation_warnings?: DmrCalculationWarning[];
} {
  const outfall = row.outfall as Record<string, unknown> | null;
  const parameter = row.parameter as Record<string, unknown> | null;
  const cms = isCmsDmrRow(row);

  const measuredValue = cms
    ? ((row.concentration_max as number | null) ??
      (row.concentration_avg as number | null) ??
      null)
    : ((row.measured_value as number | null) ?? null);

  const measuredUnit = cms
    ? ((row.concentration_units as string | null) ?? null)
    : ((row.measured_unit as string | null) ?? null);

  const limitValue = cms
    ? ((row.permit_limit_max as number | null) ?? null)
    : ((row.limit_value as number | null) ?? null);

  const limitUnit = cms
    ? ((row.concentration_units as string | null) ?? null)
    : ((row.limit_unit as string | null) ?? null);

  const sampleCount = cms
    ? ((row.number_of_samples as number | null) ?? null)
    : ((row.sample_count as number | null) ?? null);

  const warnings = row.calculation_warnings;
  const calculationWarnings = Array.isArray(warnings)
    ? (warnings as DmrCalculationWarning[])
    : [];

  const base: DmrLineItem = {
    id: row.id as string,
    submission_id: (row.submission_id as string | undefined) ?? (row.dmr_submission_id as string),
    outfall_id: row.outfall_id as string,
    parameter_id: row.parameter_id as string,
    statistical_base: (row.statistical_base as DmrLineItem['statistical_base']) ?? 'maximum',
    limit_value: limitValue,
    limit_unit: limitUnit,
    limit_type: (row.limit_type as DmrLineItem['limit_type']) ?? null,
    measured_value: measuredValue,
    measured_unit: measuredUnit,
    nodi_code: (row.nodi_code as NodiCode | null) ?? null,
    is_exceedance: Boolean(row.is_exceedance),
    exceedance_pct: (row.exceedance_pct as number | null) ?? null,
    sample_count: sampleCount,
    sample_frequency: (row.sample_frequency as string | null) ?? null,
    storet_code: (row.storet_code as string | null) ?? null,
    qualifier: (row.qualifier as string | null) ?? null,
    comments: (row.comments as string | null) ?? (row.exemption_notes as string | null) ?? null,
    created_at: row.created_at as string,
  };

  return {
    ...base,
    calculation_warnings: calculationWarnings,
    submission: null,
    outfall: outfall
      ? {
          outfall_number: (outfall.outfall_number as string) ?? 'Unknown',
          permit_id: outfall.permit_id as string,
        }
      : null,
    parameter: parameter
      ? {
          name: parameter.name as string,
          short_name: (parameter.short_name as string | null) ?? null,
          storet_code: (parameter.storet_code as string | null) ?? null,
        }
      : null,
  };
}
