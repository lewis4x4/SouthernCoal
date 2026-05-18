export type AdministrativeDispositionResolution = 'continued' | 'expired' | 'investigate';

export type NpdesPermitAdministrativeDisposition = {
  administratively_continued: boolean | null;
  requires_administrative_investigation: boolean;
};

/** Persisted update payload for `npdes_permits` after an admin resolution. */
export function buildNpdesPermitDispositionUpdate(
  resolution: AdministrativeDispositionResolution,
): Pick<
  NpdesPermitAdministrativeDisposition,
  'administratively_continued' | 'requires_administrative_investigation'
> {
  if (resolution === 'continued') {
    return {
      administratively_continued: true,
      requires_administrative_investigation: false,
    };
  }
  if (resolution === 'expired') {
    return {
      administratively_continued: false,
      requires_administrative_investigation: false,
    };
  }
  return {
    administratively_continued: false,
    requires_administrative_investigation: true,
  };
}

/** Permits in the admin data-quality queue (expired status, not yet dispositioned). */
export function isPermitAwaitingAdministrativeDisposition(
  row: Pick<NpdesPermitAdministrativeDisposition, 'administratively_continued'>,
): boolean {
  return row.administratively_continued === null;
}

/** Downstream filter: permits flagged for follow-up investigation. */
export function permitRequiresAdministrativeInvestigation(
  row: Pick<NpdesPermitAdministrativeDisposition, 'requires_administrative_investigation'>,
): boolean {
  return row.requires_administrative_investigation === true;
}

/** Human-readable label for reports and audit exports. */
export function formatAdministrativeDispositionLabel(
  row: NpdesPermitAdministrativeDisposition,
): 'Unreviewed' | 'Continued' | 'Investigate' | 'Expired' {
  if (isPermitAwaitingAdministrativeDisposition(row)) return 'Unreviewed';
  if (row.administratively_continued === true) return 'Continued';
  if (permitRequiresAdministrativeInvestigation(row)) return 'Investigate';
  return 'Expired';
}
