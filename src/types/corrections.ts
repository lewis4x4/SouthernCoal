export interface DataCorrection {
  id: string;
  organization_id: string;
  entity_type: 'lab_result' | 'permit_limit' | 'dmr_line_item' | 'exceedance';
  entity_id: string;
  field_name: string;
  original_value: unknown;
  proposed_value: unknown;
  justification: string;
  supporting_evidence_path: string | null;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected';
  requested_by: string;
  reviewed_by: string | null;
  review_comment: string | null;
  requested_at: string;
  reviewed_at: string | null;
  applied_at: string | null;
  created_at: string;
}

// For display
export const ENTITY_TYPE_LABELS: Record<DataCorrection['entity_type'], string> = {
  lab_result: 'Lab Result',
  permit_limit: 'Permit Limit',
  dmr_line_item: 'DMR Line Item',
  exceedance: 'Exceedance',
};

export const STATUS_LABELS: Record<DataCorrection['status'], string> = {
  draft: 'Draft',
  pending_review: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
};
