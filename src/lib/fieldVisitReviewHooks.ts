import type { FieldVisitOutcome, GovernanceIssueRecord } from '@/types';

export type FieldVisitReviewHook = {
  id: string;
  title: string;
  body: string;
  tone: 'warning' | 'critical' | 'info';
};

export function getFieldVisitReviewHooks(input: {
  outcome: FieldVisitOutcome;
  totalPhotoCount: number;
  siblingVisitCount: number;
  governanceIssues: GovernanceIssueRecord[];
  deficiencyPromptCount: number;
  contactAttempted: boolean;
  accessIssueType: string;
  potentialForceMajeure: boolean;
  outboundPendingCount: number;
  evidenceFailureCount: number;
}): FieldVisitReviewHook[] {
  const hooks: FieldVisitReviewHook[] = [];

  if (input.siblingVisitCount > 0) {
    hooks.push({
      id: 'duplicate-stop',
      title: 'Same-day duplicate stop review',
      body: 'Another visit exists for this outfall on the same day. Reviewers should confirm which record is authoritative before downstream follow-up.',
      tone: 'warning',
    });
  }

  if (input.deficiencyPromptCount > 0 && input.governanceIssues.length === 0) {
    hooks.push({
      id: 'deficiency-review',
      title: 'Inspection suggests follow-up',
      body: 'Inspection conditions suggest a deficiency, but no governance issue is currently linked. Make sure the notes and evidence are strong enough for review.',
      tone: 'info',
    });
  }

  if (input.outcome === 'access_issue' && !input.contactAttempted) {
    hooks.push({
      id: 'contact-missing',
      title: 'Access issue without contact attempt',
      body: 'No contact attempt is recorded. Reviewers may need to confirm whether an escalation or outreach step was skipped.',
      tone: 'warning',
    });
  }

  if (input.outcome === 'sample_collected' && input.totalPhotoCount === 0) {
    hooks.push({
      id: 'sample-low-evidence',
      title: 'Sample collected with no photo evidence',
      body: 'Sample collection has no supporting photo evidence. This does not block completion, but it weakens review context.',
      tone: 'info',
    });
  }

  if ((input.outcome === 'no_discharge' || input.outcome === 'access_issue') && input.totalPhotoCount < 2) {
    hooks.push({
      id: 'outcome-thin-evidence',
      title: 'Thin evidence package',
      body: 'This outcome is supported by a minimal photo set. Consider capturing another photo if the site context is ambiguous.',
      tone: 'info',
    });
  }

  if (input.accessIssueType === 'safety_hazard') {
    hooks.push({
      id: 'safety-review',
      title: 'Safety hazard review',
      body: 'This stop was routed as a safety hazard. Make sure the narrative and evidence are strong enough for supervisor review.',
      tone: 'critical',
    });
  }

  if (input.potentialForceMajeure) {
    hooks.push({
      id: 'fm-review',
      title: 'Force majeure candidate',
      body: 'Potential force majeure was flagged. Reviewers should confirm timing and supporting evidence before notice handling proceeds.',
      tone: 'critical',
    });
  }

  if (input.outboundPendingCount > 0 || input.evidenceFailureCount > 0) {
    hooks.push({
      id: 'sync-review',
      title: 'Sync not complete',
      body: 'This visit still has queued actions or failed uploads on the device. Reviewers should treat the record as provisional until sync is clean.',
      tone: 'warning',
    });
  }

  return hooks;
}
