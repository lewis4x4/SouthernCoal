/**
 * Milestone 1 (Lane A) online field execution audit actions — A5 checklist reference.
 */
export const MILESTONE_1_FIELD_AUDIT_ACTIONS = [
  'field_visit_completed',
  'field_visit_completion_queued',
] as const;

export type Milestone1FieldAuditAction = (typeof MILESTONE_1_FIELD_AUDIT_ACTIONS)[number];

/** Maps LANE_A_MILESTONE_1_QA acceptance IDs to primary Vitest files. */
export const MILESTONE_1_QA_AUTOMATED_COVERAGE = {
  A1: [
    'src/lib/__tests__/fieldVisitInspectionRouting.test.ts',
    'src/lib/__tests__/fieldRouteLocalCache.test.ts',
  ],
  A2: [
    'src/lib/__tests__/fieldVisitCompletionValidation.test.ts',
    'src/lib/__tests__/fieldVisitRequirements.test.ts',
  ],
  A3: ['src/lib/__tests__/fieldVisitCompletionValidation.test.ts'],
  A4: ['src/lib/__tests__/fieldOutboundQueue.test.ts'],
  A5: ['src/lib/__tests__/milestone1QaCoverage.test.ts'],
  A6: [
    'src/lib/__tests__/fieldOutboundQueue.test.ts',
    'src/lib/__tests__/fieldSyncPending.test.ts',
  ],
} as const;

/** Flat Vitest paths for `npm run qa:lane-a-m1` (staging gate before A1–A6 manual QA). */
export const MILESTONE_1_QA_VITEST_FILES = [
  ...new Set(Object.values(MILESTONE_1_QA_AUTOMATED_COVERAGE).flat()),
] as const;
