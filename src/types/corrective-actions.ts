// =============================================================================
// Corrective Action Module Types
// =============================================================================
// Based on EMS Document 2015-013 Corrective Action Form
// 7-step workflow with digital signatures
// =============================================================================

// ---------------------------------------------------------------------------
// Workflow Steps (EMS 7-Step Process)
// ---------------------------------------------------------------------------
export const WORKFLOW_STEPS = [
  'identification',
  'root_cause_analysis',
  'corrective_action_plan',
  'preventive_action',
  'implementation',
  'verification',
  'closure',
] as const;

export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

export const WORKFLOW_STEP_LABELS: Record<WorkflowStep, string> = {
  identification: '1. Identification',
  root_cause_analysis: '2. Root Cause Analysis',
  corrective_action_plan: '3. Corrective Action Plan',
  preventive_action: '4. Preventive Action',
  implementation: '5. Implementation',
  verification: '6. Verification',
  closure: '7. Closure',
};

export const WORKFLOW_STEP_SHORT_LABELS: Record<WorkflowStep, string> = {
  identification: 'Identification',
  root_cause_analysis: 'Root Cause',
  corrective_action_plan: 'Action Plan',
  preventive_action: 'Prevention',
  implementation: 'Implementation',
  verification: 'Verification',
  closure: 'Closure',
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
export const CA_STATUSES = [
  'open',
  'in_progress',
  'completed',
  'verified',
  'closed',
] as const;

export type CAStatus = (typeof CA_STATUSES)[number];

export const CA_STATUS_LABELS: Record<CAStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  verified: 'Verified',
  closed: 'Closed',
};

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------
export const CA_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export type CAPriority = (typeof CA_PRIORITIES)[number];

export const CA_PRIORITY_LABELS: Record<CAPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

// ---------------------------------------------------------------------------
// Source Types (what triggered the CA)
// ---------------------------------------------------------------------------
export const SOURCE_TYPES = [
  'exceedance',
  'enforcement',
  'audit',
  'inspection',
  'manual',
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  exceedance: 'Exceedance',
  enforcement: 'Enforcement Action',
  audit: 'Audit Finding',
  inspection: 'Inspection Finding',
  manual: 'Manual Entry',
};

// ---------------------------------------------------------------------------
// Main Corrective Action Record
// ---------------------------------------------------------------------------
export interface CorrectiveAction {
  id: string;
  organization_id: string;

  // Location
  site_id: string | null;
  npdes_permit_id: string | null;
  smcra_permit_number: string | null;
  county: string | null;
  state: string | null;

  // Source
  source_type: SourceType;
  source_id: string | null;
  title: string;

  // Incident Detail (Document 2015-013 Section 2)
  description: string | null;
  date_issued: string | null;
  date_received: string | null;
  issuing_person: string | null;
  issuing_agency: string | null;
  issued_to: string | null;
  regulation_cited: string | null;

  // Follow-up (Document 2015-013 Sections 3-7)
  followup_assigned_to: string | null;
  contributing_factors: string | null;
  root_cause: string | null;
  immediate_mitigation: string | null;
  action_taken: string | null;
  preventive_action: string | null;
  documents_requiring_revision: string | null;
  effectiveness_assessment: string | null;
  notes: string | null;

  // Workflow
  workflow_step: WorkflowStep;
  workflow_step_due_date: string | null;
  workflow_step_completed_at: string | null;

  // Status & Priority
  status: CAStatus;
  priority: CAPriority;
  due_date: string | null;
  completed_date: string | null;

  // Digital Signatures
  responsible_person_id: string | null;
  responsible_person_signed_at: string | null;
  approved_by_id: string | null;
  approved_by_signed_at: string | null;

  // Verification
  verified_by: string | null;
  verified_date: string | null;

  // PDF Generation
  generated_pdf_path: string | null;
  generated_pdf_at: string | null;
  document_id: string | null;

  // Closure
  closed_date: string | null;
  closed_by: string | null;

  // Audit
  created_at: string;
  updated_at: string;

  // JOINed data (from queries)
  organization_name?: string;
  site_name?: string;
  permit_number?: string;
  assigned_to_name?: string;
  responsible_person_name?: string;
  approved_by_name?: string;
}

// ---------------------------------------------------------------------------
// Form Data per Workflow Step
// ---------------------------------------------------------------------------
export interface IdentificationStepData {
  title?: string;
  description?: string;
  date_received?: string;
  source_type?: SourceType;
  followup_assigned_to?: string;
  priority?: CAPriority;
}

export interface RootCauseStepData {
  contributing_factors?: string;
  root_cause?: string;
}

export interface CorrectiveActionPlanStepData {
  immediate_mitigation?: string;
  action_taken?: string;
}

export interface PreventiveActionStepData {
  preventive_action?: string;
  documents_requiring_revision?: string;
}

export interface ImplementationStepData {
  completed_date?: string;
  notes?: string;
}

export interface VerificationStepData {
  effectiveness_assessment?: string;
  verified_by?: string;
  verified_date?: string;
}

export interface ClosureStepData {
  responsible_person_signed_at?: string;
  approved_by_signed_at?: string;
}

// ---------------------------------------------------------------------------
// Activity / Audit Trail
// ---------------------------------------------------------------------------
export interface CAActivity {
  id: string;
  corrective_action_id: string;
  user_id: string;
  user_name: string;
  action: string;
  description: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
export interface CAFilters {
  status?: CAStatus;
  priority?: CAPriority;
  workflow_step?: WorkflowStep;
  assigned_to?: string;
  source_type?: SourceType;
  site_id?: string;
  overdue_only?: boolean;
  date_from?: string;
  date_to?: string;
}

// ---------------------------------------------------------------------------
// Step Requirements (what must be filled before advancing)
// ---------------------------------------------------------------------------
// Issue #8 Fix: Single source of truth for required fields (consolidates form and workflow validation)
export const STEP_REQUIRED_FIELDS: Record<WorkflowStep, string[]> = {
  identification: ['title', 'description', 'priority', 'followup_assigned_to'],
  root_cause_analysis: ['root_cause'],
  corrective_action_plan: ['immediate_mitigation'],
  preventive_action: ['preventive_action'],
  implementation: ['completed_date'],
  verification: ['effectiveness_assessment', 'verified_by', 'verified_date'],
  closure: ['responsible_person_signed_at', 'approved_by_signed_at'],
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------
export function getStepIndex(step: WorkflowStep): number {
  return WORKFLOW_STEPS.indexOf(step);
}

export function getNextStep(step: WorkflowStep): WorkflowStep | null {
  const idx = getStepIndex(step);
  if (idx >= WORKFLOW_STEPS.length - 1) return null;
  const next = WORKFLOW_STEPS[idx + 1];
  return next ?? null;
}

export function getPreviousStep(step: WorkflowStep): WorkflowStep | null {
  const idx = getStepIndex(step);
  if (idx <= 0) return null;
  const prev = WORKFLOW_STEPS[idx - 1];
  return prev ?? null;
}

export function isOverdue(ca: CorrectiveAction): boolean {
  if (ca.status === 'closed') return false;
  if (!ca.due_date) return false;
  const today = new Date().toISOString().split('T')[0] ?? '';
  return ca.due_date < today;
}

export function getDaysOverdue(ca: CorrectiveAction): number {
  if (!ca.due_date) return 0;
  const today = new Date();
  const due = new Date(ca.due_date);
  const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export function getDaysOpen(ca: CorrectiveAction): number {
  const created = new Date(ca.created_at);
  const end = ca.closed_date ? new Date(ca.closed_date) : new Date();
  return Math.floor((end.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}
