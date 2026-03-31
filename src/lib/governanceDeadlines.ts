export type GovernanceDeadlineTone = 'empty' | 'ok' | 'soon' | 'overdue';

export interface GovernanceDeadlineDescription {
  /** Localized date/time plus relative hint when applicable */
  text: string;
  tone: GovernanceDeadlineTone;
}

/**
 * Human-readable deadline line for governance / force-majeure surfacing.
 * `nowMs` is injectable for tests.
 */
export function describeGovernanceDeadline(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): GovernanceDeadlineDescription {
  if (iso == null || iso === '') {
    return { text: '—', tone: 'empty' };
  }
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) {
    return { text: '—', tone: 'empty' };
  }

  const formatted = new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const msLeft = end - nowMs;
  if (msLeft < 0) {
    return { text: `${formatted} (overdue)`, tone: 'overdue' };
  }

  const hoursLeft = msLeft / (3600 * 1000);
  if (hoursLeft < 48) {
    if (hoursLeft < 24) {
      const h = Math.max(1, Math.round(hoursLeft));
      return { text: `${formatted} (~${h}h left)`, tone: 'soon' };
    }
    const d = Math.round(hoursLeft / 24);
    return { text: `${formatted} (~${d}d left)`, tone: 'soon' };
  }

  const daysLeft = Math.floor(msLeft / (24 * 3600 * 1000));
  return { text: `${formatted} (${daysLeft}d left)`, tone: 'ok' };
}
