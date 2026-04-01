/**
 * Lane A (WV field spine) — active product milestone.
 * Source document: Roadmap/LANE_A_MILESTONE_1.md
 */

export const LANE_A_MILESTONE_1_ID = 'lane_a_milestone_1_field_execution_online';

/** Single-line summary for UI, dashboards, or logs. */
export const LANE_A_MILESTONE_1_SUMMARY =
  'WV sampler runs today’s route online, completes stops with evidence rules, syncs to Supabase, with client audit on completion.';

/** Keys matching acceptance rows in LANE_A_MILESTONE_1.md */
export const LANE_A_MILESTONE_1_ACCEPTANCE_KEYS = [
  'A1_route_today',
  'A2_outcome_evidence_gates',
  'A3_gps_at_complete',
  'A4_online_rpc',
  'A5_client_audit_complete',
  'A6_offline_queue',
] as const;

export type LaneAMilestone1AcceptanceKey =
  (typeof LANE_A_MILESTONE_1_ACCEPTANCE_KEYS)[number];
