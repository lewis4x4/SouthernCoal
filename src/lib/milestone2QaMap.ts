/**
 * Milestone 2 (Lane A) sync-resolution audit actions — B5 checklist reference.
 * Kept in lib so Vitest can assert stability without importing useAuditLog internals.
 */
export const MILESTONE_2_FIELD_SYNC_AUDIT_ACTIONS = [
  'field_outbound_queue_flushed',
  'field_outbound_queue_blocked',
  'field_outbound_conflict_hold',
  'field_sync_manual_refresh',
  'field_visit_completion_queued',
  'field_visit_completed',
] as const;

export type Milestone2FieldSyncAuditAction =
  (typeof MILESTONE_2_FIELD_SYNC_AUDIT_ACTIONS)[number];

/** Maps LANE_A_MILESTONE_2_QA acceptance IDs to primary Vitest files. */
export const MILESTONE_2_QA_AUTOMATED_COVERAGE = {
  B1: [
    'src/lib/__tests__/fieldRouteLocalCache.test.ts',
    'src/lib/__tests__/fieldVisitLocalCache.test.ts',
  ],
  B2: [
    'src/lib/__tests__/fieldOutboundQueueDiagnostic.test.ts',
    'src/lib/__tests__/fieldSyncPending.test.ts',
  ],
  B3: ['src/lib/__tests__/fieldOutboundQueue.test.ts'],
  B4: ['src/lib/__tests__/fieldOutboundQueue.test.ts'],
  B5: ['src/lib/__tests__/milestone2QaCoverage.test.ts'],
} as const;
