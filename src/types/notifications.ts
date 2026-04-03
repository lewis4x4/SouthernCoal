export type NotificationPriority = 'info' | 'warning' | 'urgent' | 'critical' | 'emergency';

export type NotificationEventType =
  | 'deadline_approaching'
  | 'deadline_overdue'
  | 'exceedance_detected'
  | 'corrective_action_assigned'
  | 'corrective_action_due'
  | 'governance_issue_raised'
  | 'governance_escalated'
  | 'field_visit_completed'
  | 'readiness_check_failed'
  | 'readiness_gate_overridden'
  | 'correction_submitted'
  | 'correction_reviewed'
  | 'upload_processed'
  | 'upload_failed'
  | 'sync_conflict'
  | 'incident_escalated'
  | 'ca_step_advanced'
  | 'ca_signature_requested'
  | 'ca_overdue';

export interface Notification {
  id: string;
  organization_id: string;
  recipient_id: string;
  event_type: string;
  priority: NotificationPriority;
  title: string;
  body: string | null;
  channels: string[];
  in_app_read_at: string | null;
  email_sent_at: string | null;
  sms_sent_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  dismissed_at: string | null;
}

export interface NotificationPreference {
  id: string;
  user_id: string;
  event_type: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
}

/** Display labels for event types in the preferences UI */
export const EVENT_TYPE_LABELS: Record<NotificationEventType, string> = {
  deadline_approaching: 'Deadline Approaching',
  deadline_overdue: 'Deadline Overdue',
  exceedance_detected: 'Exceedance Detected',
  corrective_action_assigned: 'Corrective Action Assigned',
  corrective_action_due: 'Corrective Action Due',
  governance_issue_raised: 'Governance Issue Raised',
  governance_escalated: 'Governance Escalated',
  field_visit_completed: 'Field Visit Completed',
  readiness_check_failed: 'Readiness Check Failed',
  readiness_gate_overridden: 'Readiness Gate Overridden',
  correction_submitted: 'Correction Submitted',
  correction_reviewed: 'Correction Reviewed',
  upload_processed: 'Upload Processed',
  upload_failed: 'Upload Failed',
  sync_conflict: 'Sync Conflict',
  incident_escalated: 'Incident Escalated',
  ca_step_advanced: 'CA Step Advanced',
  ca_signature_requested: 'CA Signature Requested',
  ca_overdue: 'CA Overdue',
};

export const PRIORITY_COLORS: Record<NotificationPriority, { bg: string; border: string; text: string }> = {
  info: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400' },
  warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
  urgent: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400' },
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
  emergency: { bg: 'bg-red-600/15', border: 'border-red-600/30', text: 'text-red-300' },
};
