import type { RecordClassification } from '@/types/auth';

/**
 * Classification severity ordering (lowest → highest).
 * Used to enforce "floor" rules — a record can only be elevated, never lowered below its floor.
 */
const CLASSIFICATION_SEVERITY: RecordClassification[] = [
  'operational_internal',
  'public_eligible',
  'regulator_shareable',
  'compliance_sensitive',
  'privileged',
  'restricted',
];

export function classificationSeverity(level: RecordClassification): number {
  return CLASSIFICATION_SEVERITY.indexOf(level);
}

/**
 * Returns the higher of two classification levels.
 * Used to enforce floor rules (e.g., decree paragraphs → at least compliance_sensitive).
 */
export function maxClassification(a: RecordClassification, b: RecordClassification): RecordClassification {
  return classificationSeverity(a) >= classificationSeverity(b) ? a : b;
}

/**
 * Auto-classify a governance issue based on its attributes.
 * Mirrors the DB trigger logic so the UI can show the expected classification
 * before the server round-trip.
 */
export function autoClassifyGovernanceIssue(opts: {
  decreeParagraphs?: string[] | null;
  currentLevel?: RecordClassification;
}): RecordClassification {
  const base = opts.currentLevel ?? 'operational_internal';

  if (opts.decreeParagraphs && opts.decreeParagraphs.length > 0) {
    return maxClassification(base, 'compliance_sensitive');
  }

  return base;
}

export const CLASSIFICATION_LABELS: Record<RecordClassification, string> = {
  operational_internal: 'Operational Internal',
  compliance_sensitive: 'Compliance Sensitive',
  privileged: 'Privileged',
  public_eligible: 'Public Eligible',
  regulator_shareable: 'Regulator Shareable',
  restricted: 'Restricted',
};

export const CLASSIFICATION_COLORS: Record<RecordClassification, string> = {
  operational_internal: 'text-text-secondary',
  public_eligible: 'text-emerald-400',
  regulator_shareable: 'text-blue-400',
  compliance_sensitive: 'text-amber-400',
  privileged: 'text-orange-400',
  restricted: 'text-red-400',
};
