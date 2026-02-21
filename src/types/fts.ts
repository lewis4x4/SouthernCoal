export interface FtsUpload {
  id: string;
  organization_id: string;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  quarter: number;
  year: number;
  format_version: 'Q3_legacy' | 'Q4_plus';
  parse_status: 'pending' | 'processing' | 'completed' | 'failed';
  parse_error: string | null;
  total_penalties: number | null;
  total_violations: number | null;
  created_at: string;
  updated_at: string;
}

export interface FtsViolation {
  id: string;
  upload_id: string;
  organization_id: string;
  monitoring_year: number;
  monitoring_month: number;
  monitoring_quarter: number;
  state: string;
  dnr_number: string;
  outfall_number: string;
  penalty_category: 1 | 2;
  penalty_amount: number;
  notes: string | null;
  created_at: string;
}

export interface FtsMonthlyTotal {
  id: string;
  upload_id: string;
  organization_id: string;
  monitoring_year: number;
  monitoring_month: number;
  monitoring_quarter: number;
  state: string;
  total_penalties: number;
  quarter_to_date: number | null;
  created_at: string;
}

export interface FtsKpis {
  totalYtd: number;
  currentQuarter: number;
  currentQuarterNum: number;
  worstState: { state: string; amount: number; percentage: number } | null;
  violationCount: number;
  cat1Count: number;
  cat2Count: number;
  mostPenalizedPermit: { dnr: string; state: string; amount: number; count: number } | null;
  repeatOffenderRate: number;
  momChange: { percentage: number; priorMonthName: string } | null;
}

export type FtsFilters = {
  year: number | null;
  quarter: number | null;
  state: string | null;
  dnrSearch: string;
};
