export type CutoverBatchStatus = 'draft' | 'ready' | 'executing' | 'executed' | 'failed';

export interface CutoverBatch {
  id: string;
  organization_id: string;
  label: string;
  effective_at: string;
  executed_at: string | null;
  executed_by: string | null;
  created_by: string | null;
  status: CutoverBatchStatus;
  writes_frozen: boolean;
  notes: string | null;
  summary_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CutoverMatrixUpload {
  id: string;
  batch_id: string;
  organization_id: string;
  file_name: string;
  file_size_bytes: number | null;
  file_format: 'xlsx' | 'csv';
  uploaded_by: string | null;
  parsed_row_count: number;
  resolution_summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type CutoverDisposition = 'live' | 'archive' | 'exclude';
export type CutoverResolutionStatus = 'pending' | 'matched' | 'unresolved' | 'ambiguous' | 'excluded';

export interface CutoverMatrixRow {
  id: string;
  batch_id: string;
  upload_id: string | null;
  organization_id: string;
  row_number: number;
  state_code: string | null;
  site_name: string | null;
  permit_number: string | null;
  outfall_number: string | null;
  external_npdes_id: string | null;
  facility_name: string | null;
  mine_id: string | null;
  disposition: CutoverDisposition;
  notes: string | null;
  raw_json: Record<string, unknown>;
  resolved_site_id: string | null;
  resolved_permit_id: string | null;
  resolved_outfall_id: string | null;
  resolution_status: CutoverResolutionStatus;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiveProgramRosterRow {
  id: string;
  organization_id: string;
  cutover_batch_id: string;
  state_code: string | null;
  site_id: string;
  permit_id: string | null;
  outfall_id: string | null;
  source_row_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ArchiveManifestRow {
  id: string;
  batch_id: string;
  organization_id: string;
  table_name: string;
  archived_row_count: number;
  checksum_text: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ParsedCutoverMatrixRowInput {
  row_number: number;
  state_code: string | null;
  site_name: string | null;
  permit_number: string | null;
  outfall_number: string | null;
  external_npdes_id: string | null;
  facility_name: string | null;
  mine_id: string | null;
  disposition: CutoverDisposition;
  notes: string | null;
  raw_json: Record<string, unknown>;
}
