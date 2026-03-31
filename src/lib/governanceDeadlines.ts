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

const TONE_RANK: Record<GovernanceDeadlineTone, number> = {
  overdue: 3,
  soon: 2,
  ok: 1,
  empty: 0,
};

type DeadlineLabel = 'Response' | 'Notice' | 'Written';

const LABEL_ORDER: Record<DeadlineLabel, number> = {
  Response: 0,
  Notice: 1,
  Written: 2,
};

function compactDeadlineLine(iso: string, nowMs: number): { tone: GovernanceDeadlineTone; line: string } {
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) {
    return { tone: 'empty', line: '' };
  }
  const dateShort = new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const ms = end - nowMs;
  if (ms < 0) {
    return { tone: 'overdue', line: `${dateShort} · overdue` };
  }
  const hours = ms / (3600 * 1000);
  if (hours < 48) {
    if (hours < 24) {
      const h = Math.max(1, Math.round(hours));
      return { tone: 'soon', line: `${dateShort} · ~${h}h` };
    }
    const d = Math.round(hours / 24);
    return { tone: 'soon', line: `${dateShort} · ~${d}d` };
  }
  const days = Math.floor(ms / (24 * 3600 * 1000));
  return { tone: 'ok', line: `${dateShort} · ${days}d` };
}

export interface GovernanceInboxUrgentLine {
  /** e.g. "Notice: Mar 18, 2026 · overdue" */
  text: string;
  tone: GovernanceDeadlineTone;
}

/**
 * Single-line summary for governance queue cards: picks the most urgent among
 * response / notice / written (overdue first, then soonest upcoming).
 */
export function governanceInboxUrgentLine(
  issue: {
    response_deadline: string | null;
    notice_deadline: string | null;
    written_deadline: string | null;
  },
  nowMs: number = Date.now(),
): GovernanceInboxUrgentLine {
  const labeled: { label: DeadlineLabel; iso: string }[] = [
    { label: 'Response', iso: issue.response_deadline ?? '' },
    { label: 'Notice', iso: issue.notice_deadline ?? '' },
    { label: 'Written', iso: issue.written_deadline ?? '' },
  ].filter((x): x is { label: DeadlineLabel; iso: string } => x.iso !== '');

  type Scored = { label: DeadlineLabel; end: number; tone: GovernanceDeadlineTone; line: string };
  const scored: Scored[] = [];
  for (const { label, iso } of labeled) {
    const { tone, line } = compactDeadlineLine(iso, nowMs);
    if (tone === 'empty' || line === '') continue;
    const end = new Date(iso).getTime();
    scored.push({ label, end, tone, line });
  }

  if (scored.length === 0) {
    return { text: '', tone: 'empty' };
  }

  const pick = scored.reduce((best, cur) => {
    if (TONE_RANK[cur.tone] > TONE_RANK[best.tone]) return cur;
    if (TONE_RANK[cur.tone] < TONE_RANK[best.tone]) return best;
    if (cur.end !== best.end) {
      return cur.end <= best.end ? cur : best;
    }
    return LABEL_ORDER[cur.label] < LABEL_ORDER[best.label] ? cur : best;
  });

  return {
    text: `${pick.label}: ${pick.line}`,
    tone: pick.tone,
  };
}
