export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentRecoverability = 'recoverable' | 'non_recoverable' | 'unknown';
export type IncidentStatus =
  | 'open' | 'investigating' | 'escalated' | 'pending_action'
  | 'action_taken' | 'monitoring' | 'closed' | 'closed_no_action';

export type IncidentCategory =
  | 'field' | 'sample_integrity' | 'equipment'
  | 'regulatory' | 'environmental' | 'safety' | 'data_quality';

export type IncidentEventType =
  | 'created' | 'status_changed' | 'severity_changed' | 'escalated'
  | 'owner_changed' | 'note_added' | 'evidence_linked' | 'ca_created'
  | 'countdown_started' | 'countdown_paused' | 'countdown_resumed'
  | 'countdown_expired' | 'resolved' | 'reopened' | 'classified';

export interface IncidentType {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description: string | null;
  category: IncidentCategory;
  default_severity: IncidentSeverity;
  default_recoverability: IncidentRecoverability;
  auto_ca_enabled: boolean;
  countdown_hours: number | null;
  operational_chain_id: string | null;
  compliance_chain_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Incident {
  id: string;
  organization_id: string;
  incident_type_id: string;
  incident_number: number;
  severity: IncidentSeverity;
  recoverability: IncidentRecoverability;
  status: IncidentStatus;
  classification_level: string;
  title: string;
  description: string | null;
  root_cause: string | null;
  countdown_started_at: string | null;
  countdown_expires_at: string | null;
  countdown_reason: string | null;
  countdown_paused: boolean;
  active_chain_type: 'operational' | 'compliance';
  current_escalation_step: number;
  current_owner_name: string | null;
  current_owner_role: string | null;
  current_owner_user_id: string | null;
  escalated_at: string | null;
  field_visit_id: string | null;
  outfall_id: string | null;
  permit_id: string | null;
  corrective_action_id: string | null;
  legacy_governance_issue_id: string | null;
  auto_ca_triggered: boolean;
  auto_ca_created_at: string | null;
  decree_paragraphs: string[];
  reported_by: string | null;
  reported_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentEvent {
  id: string;
  incident_id: string;
  event_type: IncidentEventType;
  actor_name: string;
  actor_user_id: string | null;
  old_value: string | null;
  new_value: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface EscalationChain {
  id: string;
  organization_id: string;
  name: string;
  chain_type: 'operational' | 'compliance';
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface EscalationChainStep {
  id: string;
  chain_id: string;
  step_number: number;
  owner_name: string;
  owner_role: string;
  owner_user_id: string | null;
  sla_hours: number;
  auto_escalate: boolean;
  notification_channels: string[];
  created_at: string;
}

export const SEVERITY_COLORS: Record<IncidentSeverity, { bg: string; border: string; text: string }> = {
  critical: { bg: 'bg-red-600/15', border: 'border-red-600/30', text: 'text-red-300' },
  high: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400' },
  medium: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
  low: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' },
};

export const STATUS_COLORS: Record<IncidentStatus, { bg: string; border: string; text: string }> = {
  open: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
  investigating: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
  escalated: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400' },
  pending_action: { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400' },
  action_taken: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400' },
  monitoring: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' },
  closed: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
  closed_no_action: { bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-400' },
};

export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  field: 'Field',
  sample_integrity: 'Sample Integrity',
  equipment: 'Equipment',
  regulatory: 'Regulatory',
  environmental: 'Environmental',
  safety: 'Safety',
  data_quality: 'Data Quality',
};

export const RECOVERABILITY_LABELS: Record<IncidentRecoverability, { label: string; color: string }> = {
  recoverable: { label: 'Recoverable', color: 'text-emerald-400' },
  non_recoverable: { label: 'Non-Recoverable', color: 'text-red-400' },
  unknown: { label: 'Unknown', color: 'text-text-muted' },
};
