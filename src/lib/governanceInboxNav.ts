import type { GovernanceInboxFilter } from '@/hooks/useGovernanceIssues';

export const GOVERNANCE_INBOX_QUERY_KEY = 'inbox';

const VALID: readonly GovernanceInboxFilter[] = ['bill_primary', 'all_open', 'escalated'];

export function parseGovernanceInboxParam(raw: string | null): GovernanceInboxFilter | null {
  if (!raw) return null;
  return VALID.includes(raw as GovernanceInboxFilter) ? (raw as GovernanceInboxFilter) : null;
}

export function governanceIssuesInboxHref(inbox: GovernanceInboxFilter): string {
  return `/governance/issues?${GOVERNANCE_INBOX_QUERY_KEY}=${encodeURIComponent(inbox)}`;
}

/** Field / dispatch surfaces link here so supervisors land on a full open queue. */
export const FIELD_HANDOFF_GOVERNANCE_INBOX: GovernanceInboxFilter = 'all_open';
