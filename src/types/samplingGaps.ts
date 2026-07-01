import type { SamplingGapKind, SamplingGapSeverity } from '@/lib/samplingGapSeverity';

export type SamplingGapReviewStatus =
  | 'pending'
  | 'acknowledged'
  | 'disputed'
  | 'force_majeure'
  | 'resolved';

export interface SamplingGapRecord {
  id: string;
  organization_id: string;
  calendar_id: string;
  gap_kind: SamplingGapKind;
  severity: SamplingGapSeverity;
  review_status: SamplingGapReviewStatus;
  scheduled_date: string;
  window_end: string | null;
  days_late: number;
  dispatch_status: string | null;
  calendar_status: string | null;
  field_visit_outcome: string | null;
  field_visit_status: string | null;
  skip_reason: string | null;
  outfall_id: string;
  parameter_id: string;
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  outfalls?: { outfall_number: string | null; description: string | null } | null;
  parameters?: { short_name: string | null; name: string | null } | null;
}

export interface SamplingGapDetectionRun {
  id: string;
  organization_id: string;
  started_at: string;
  finished_at: string | null;
  as_of_date: string;
  calendars_scanned: number;
  gaps_opened: number;
  gaps_updated: number;
  gaps_resolved: number;
  status: 'running' | 'completed' | 'failed';
  source: 'scheduled' | 'manual';
  error_message: string | null;
}
