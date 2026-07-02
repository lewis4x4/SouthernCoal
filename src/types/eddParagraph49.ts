import type { EddParagraph49ReviewStatus } from '@/lib/eddParagraph49';

export interface EddParagraph49Evaluation {
  id: string;
  organization_id: string;
  import_id: string | null;
  source_file_id: string | null;
  lab_name: string | null;
  site_state: string | null;
  file_name: string | null;
  arrival_at: string;
  earliest_analysis_date: string | null;
  latest_analysis_date: string | null;
  hours_analysis_to_arrival: number | null;
  is_late_48h: boolean;
  is_exceedance_only: boolean;
  parameters_received: number;
  parameters_expected: number;
  exceedance_parameter_count: number;
  sampling_event_count: number;
  review_status: EddParagraph49ReviewStatus;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  work_order_id: string | null;
  created_at: string;
  updated_at: string;
}
