export const SCC_STATE_CODES = ['AL', 'KY', 'TN', 'VA', 'WV'] as const;
export type SccStateCode = (typeof SCC_STATE_CODES)[number];

export type RegulatoryContactType =
  | 'permit_writer'
  | 'enforcement'
  | 'dmr_support'
  | 'emergency'
  | 'inspection'
  | 'general'
  | 'legal'
  | 'technical';

export const REGULATORY_CONTACT_TYPE_LABELS: Record<RegulatoryContactType, string> = {
  permit_writer: 'Permit Writer',
  enforcement: 'Enforcement',
  dmr_support: 'DMR Support',
  emergency: 'Emergency',
  inspection: 'Inspection',
  general: 'General',
  legal: 'Legal',
  technical: 'Technical',
};

export interface StateSummary {
  id: string;
  code: string;
  name: string;
}

export interface StateRegulatoryConfig {
  id: string;
  state_id: string;
  issuing_agency_name: string;
  issuing_agency_division: string | null;
  dmr_submission_system: string;
  dmr_submission_url: string | null;
  dmr_due_day_of_month: number | null;
  dmr_due_months_after: number | null;
  below_detection_calc_rule: string;
  below_detection_dmr_rule: string;
  oral_notification_hours: number | null;
  written_notification_days: number | null;
  lab_certification_required: string | null;
  default_quantification_levels: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  states: StateSummary | null;
}

export interface RegulatoryContact {
  id: string;
  state_id: string | null;
  agency: string;
  contact_type: RegulatoryContactType;
  name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type StateRegulatoryConfigUpdate = Partial<
  Pick<
    StateRegulatoryConfig,
    | 'issuing_agency_name'
    | 'issuing_agency_division'
    | 'dmr_submission_system'
    | 'dmr_submission_url'
    | 'dmr_due_day_of_month'
    | 'dmr_due_months_after'
    | 'below_detection_calc_rule'
    | 'below_detection_dmr_rule'
    | 'oral_notification_hours'
    | 'written_notification_days'
    | 'lab_certification_required'
    | 'notes'
  >
>;

export type RegulatoryContactInput = Pick<
  RegulatoryContact,
  'state_id' | 'agency' | 'contact_type' | 'name' | 'title' | 'phone' | 'email' | 'address' | 'notes'
>;
