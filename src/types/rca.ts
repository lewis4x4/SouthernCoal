// =============================================================================
// Root Cause Analysis Types — Phase 6
// =============================================================================

// ---------------------------------------------------------------------------
// RCA Category
// ---------------------------------------------------------------------------
export const RCA_CATEGORIES = [
  'equipment_failure',
  'human_error',
  'procedure_gap',
  'weather_event',
  'design_deficiency',
  'material_failure',
  'training_gap',
  'communication_failure',
  'external_factor',
  'monitoring_gap',
  'maintenance_lapse',
  'regulatory_change',
] as const;

export type RCACategory = (typeof RCA_CATEGORIES)[number];

export const RCA_CATEGORY_LABELS: Record<RCACategory, string> = {
  equipment_failure: 'Equipment Failure',
  human_error: 'Human Error',
  procedure_gap: 'Procedure Gap',
  weather_event: 'Weather Event',
  design_deficiency: 'Design Deficiency',
  material_failure: 'Material Failure',
  training_gap: 'Training Gap',
  communication_failure: 'Communication Failure',
  external_factor: 'External Factor',
  monitoring_gap: 'Monitoring Gap',
  maintenance_lapse: 'Maintenance Lapse',
  regulatory_change: 'Regulatory Change',
};

export const RCA_CATEGORY_COLORS: Record<RCACategory, { bg: string; text: string; border: string }> = {
  equipment_failure:      { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/20' },
  human_error:            { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  procedure_gap:          { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/20' },
  weather_event:          { bg: 'bg-sky-500/10',    text: 'text-sky-400',    border: 'border-sky-500/20' },
  design_deficiency:      { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  material_failure:       { bg: 'bg-rose-500/10',   text: 'text-rose-400',   border: 'border-rose-500/20' },
  training_gap:           { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  communication_failure:  { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  external_factor:        { bg: 'bg-slate-500/10',  text: 'text-slate-400',  border: 'border-slate-500/20' },
  monitoring_gap:         { bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   border: 'border-cyan-500/20' },
  maintenance_lapse:      { bg: 'bg-teal-500/10',   text: 'text-teal-400',   border: 'border-teal-500/20' },
  regulatory_change:      { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
};

// ---------------------------------------------------------------------------
// Recurrence Risk
// ---------------------------------------------------------------------------
export const RECURRENCE_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RecurrenceRisk = (typeof RECURRENCE_RISK_LEVELS)[number];

export const RECURRENCE_RISK_COLORS: Record<RecurrenceRisk, { bg: string; text: string; border: string }> = {
  low:      { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  medium:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20' },
  high:     { bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/20' },
  critical: { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20' },
};

// ---------------------------------------------------------------------------
// RCA Template
// ---------------------------------------------------------------------------
export interface RCATemplate {
  id: string;
  organization_id: string;
  name: string;
  category: RCACategory;
  description: string | null;
  why_prompts: string[];
  suggested_preventive_actions: string[];
  decree_paragraphs: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// RCA Finding
// ---------------------------------------------------------------------------
export interface RCAFinding {
  id: string;
  corrective_action_id: string;
  organization_id: string;
  template_id: string | null;
  category: string;
  why_1: string | null;
  why_2: string | null;
  why_3: string | null;
  why_4: string | null;
  why_5: string | null;
  contributing_factors: ContributingFactor[];
  root_cause_summary: string;
  recurrence_risk: RecurrenceRisk | null;
  preventive_recommendation: string | null;
  decree_paragraphs: string[];
  analyzed_by: string | null;
  analyzed_at: string;
  created_at: string;
  updated_at: string;
}

export interface ContributingFactor {
  label: string;
  selected: boolean;
}

// ---------------------------------------------------------------------------
// Form Data
// ---------------------------------------------------------------------------
export interface RCAFormData {
  template_id?: string;
  category: RCACategory;
  why_1: string;
  why_2: string;
  why_3: string;
  why_4: string;
  why_5: string;
  contributing_factors: ContributingFactor[];
  root_cause_summary: string;
  recurrence_risk: RecurrenceRisk | null;
  preventive_recommendation: string;
  decree_paragraphs: string[];
}

export const EMPTY_RCA_FORM: RCAFormData = {
  category: 'equipment_failure',
  why_1: '',
  why_2: '',
  why_3: '',
  why_4: '',
  why_5: '',
  contributing_factors: [],
  root_cause_summary: '',
  recurrence_risk: null,
  preventive_recommendation: '',
  decree_paragraphs: [],
};
