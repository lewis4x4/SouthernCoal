import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';

type AuditAction =
  | 'matrix_export_csv'
  | 'matrix_export_markdown'
  | 'bulk_process'
  | 'bulk_retry'
  | 'staging_clear_all'
  | 'command_palette_action'
  | 'filter_change'
  | 'obligation_generation'
  | 'deadline_alert_sent'
  | 'coverage_export_csv'
  | 'audit_log_export_csv'
  | 'role_change'
  | 'user_deactivated'
  | 'user_reactivated'
  | 'access_review_completed'
  | 'correction_requested'
  | 'correction_approved'
  | 'correction_rejected'
  | 'roadmap_status_change'
  | 'roadmap_evidence_upload'
  | 'evidence_uploaded'
  | 'compliance_search'
  | 'compliance_search_export'
  | 'document_search'
  | 'generate_embedding'
  | 'external_sync_started'
  | 'external_sync_completed'
  | 'external_sync_failed'
  | 'discrepancy_detected'
  | 'discrepancy_reviewed'
  | 'discrepancy_dismissed'
  | 'discrepancy_escalated'
  | 'discrepancy_resolved'
  // Corrective Action workflow
  | 'corrective_action_created'
  | 'corrective_action_assigned'
  | 'corrective_action_step_advanced'
  | 'corrective_action_step_data_updated'
  | 'corrective_action_signed'
  | 'corrective_action_approved'
  | 'corrective_action_closed'
  | 'corrective_action_reopened'
  | 'corrective_action_pdf_generated'
  | 'corrective_action_exported'
  // Handoff workflow
  | 'handoff_processed'
  | 'handoff_applied'
  | 'handoff_bulk_applied'
  | 'handoff_conflict_resolved'
  | 'handoff_rollback'
  | 'handoff_discarded'
  | 'handoff_rejected'
  | 'handoff_single_match_applied'
  | 'handoff_attachment_uploaded'
  | 'priority_queue_generated'
  // Reporting
  | 'roadmap_report_exported'
  // FTS Penalties
  | 'fts_upload'
  | 'fts_parse_completed'
  | 'fts_export_csv'
  | 'fts_filter_change'
  // ECHO Coverage
  | 'echo_sync_manual_trigger'
  // Report Engine
  | 'report_generated'
  | 'report_template_created'
  | 'report_template_updated'
  | 'report_template_deleted'
  | 'report_template_run'
  | 'report_assistant_query'
  | 'report_permission_changed'
  | 'report_schedule_changed'
  | 'report_recipient_changed'
  | 'data_quality_status_changed'
  // Field / WV route execution (client-only refresh; server mutations still logged by Edge/DB)
  | 'field_sync_manual_refresh'
  | 'field_visit_completed'
  | 'field_visit_completion_queued'
  | 'field_outbound_queue_flushed'
  | 'field_outbound_queue_blocked'
  | 'field_outbound_conflict_hold'
  | 'field_visit_stream_flow_flood_safety_warning'
  // Phase 1 — Sync queue admin operations
  | 'sync_queue_viewed'
  | 'sync_queue_op_dismissed'
  | 'sync_queue_op_retried'
  | 'sync_queue_cleared'
  | 'sync_log_exported'
  | 'escalation_config_updated'
  // Phase 3 — Notifications & Readiness
  | 'notification_preference_updated'
  | 'readiness_check_submitted'
  | 'readiness_check_failed'
  | 'readiness_gate_override'
  | 'readiness_gate_evaluated'
  // Phase 4 — Training & Equipment
  | 'training_catalog_created'
  | 'training_completion_recorded'
  | 'training_completion_verified'
  | 'equipment_created'
  | 'equipment_assigned'
  | 'equipment_returned'
  | 'calibration_logged'
  | 'maintenance_logged'
  | 'daily_readiness_completed'
  // Phase 5 — Incident Engine
  | 'incident_created'
  | 'incident_escalated'
  | 'incident_resolved'
  | 'incident_note_added'
  | 'incident_severity_changed'
  | 'incident_chain_switched'
  // Phase 6 — CA Workflow Engine
  | 'ca_from_incident_created'
  | 'rca_finding_created'
  | 'rca_finding_deleted'
  | 'ca_reassigned'
  | 'ca_bulk_reassigned'
  | 'ca_bulk_priority_changed'
  | 'ca_analytics_exported'
  // Phase 7 — DMR Submission Pipeline
  | 'dmr_submission_created'
  | 'dmr_submitted'
  | 'dmr_marked_submitted'
  | 'dmr_auto_populated'
  | 'dmr_validated'
  | 'dmr_line_item_updated'
  | 'dmr_export_csv'
  // Phase 8 — Work Orders, Compliance DB & Overrides
  | 'work_order_created'
  | 'work_order_status_changed'
  | 'work_order_assigned'
  | 'work_order_priority_changed'
  | 'work_order_export_csv'
  | 'violation_created'
  | 'violation_status_changed'
  | 'violation_export_csv'
  | 'nov_created'
  | 'enforcement_created'
  | 'human_override_created'
  | 'human_override_approved'
  | 'legal_hold_placed'
  | 'legal_hold_released'
  // Phase 9 — Compliance Reporting & Analytics
  | 'compliance_snapshot_generated'
  | 'compliance_dashboard_exported'
  | 'kpi_target_updated'
  | 'scheduled_report_created'
  | 'scheduled_report_updated'
  | 'scheduled_report_deleted'
  | 'scheduled_report_run'
  // Phase 10 — Governance & Audit Readiness
  | 'audit_checklist_created'
  | 'audit_checklist_status_changed'
  | 'audit_checklist_item_updated'
  | 'audit_checklist_exported'
  | 'document_completeness_updated'
  | 'document_completeness_exported'
  | 'obligation_evidence_added'
  | 'obligation_evidence_verified'
  // Phase 11 — Emergency Recovery & System Hardening
  | 'emergency_contact_created'
  | 'emergency_contact_updated'
  | 'emergency_contact_deleted'
  | 'emergency_contacts_exported'
  | 'emergency_procedure_created'
  | 'emergency_procedure_updated'
  | 'emergency_procedure_reviewed'
  | 'emergency_procedures_exported'
  | 'integrity_check_run'
  | 'retention_policy_updated'
  | 'system_health_exported'
  // Phase 12 — Go-Live Validation
  | 'go_live_checklist_created'
  | 'go_live_status_changed'
  | 'go_live_item_updated'
  | 'go_live_exported'
  | 'deployment_stage_advanced'
  | 'smoke_test_recorded'
  | 'go_live_sign_off_created'
  | 'go_live_readiness_calculated'
  // Rain Event Monitoring
  | 'weather_station_created'
  | 'weather_station_updated'
  | 'weather_station_deleted'
  | 'weather_station_assigned'
  | 'weather_station_unassigned'
  | 'rain_event_activated'
  | 'rain_event_dismissed'
  | 'rain_event_manual_declared'
  | 'precipitation_reading_manual'
  | 'precipitation_data_export_csv';

export type { AuditAction };

interface AuditEntity {
  module: string;
  tableName: string;
  recordId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
}

/**
 * Frontend audit logging — v6 override of v5.
 * Logs UI-only actions that Edge Functions never see.
 * Fire-and-forget: never blocks UI on insert failure.
 *
 * audit_log columns: id, user_id, organization_id, action, module (NOT NULL),
 * table_name (NOT NULL), record_id (uuid), old_values (jsonb), new_values (jsonb),
 * ip_address, user_agent, description (text), created_at
 */
export function useAuditLog() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const userId = user?.id ?? null;
  const organizationId = profile?.organization_id ?? null;

  const log = useCallback(
    (action: AuditAction, details?: Record<string, unknown>, entity?: AuditEntity) => {
      if (!userId) return;

      // Fire-and-forget — wrap in Promise to ensure .catch() is available
      Promise.resolve(
        supabase
          .from('audit_log')
          .insert({
            user_id: userId,
            organization_id: organizationId,
            action,
            module: entity?.module ?? 'frontend',
            table_name: entity?.tableName ?? 'ui_action',
            record_id: entity?.recordId ?? null,
            old_values: entity?.oldValues ?? null,
            new_values: entity?.newValues ?? null,
            description: details ? JSON.stringify(details) : null,
            created_at: new Date().toISOString(),
          }),
      )
        .then(({ error }) => {
          if (error) {
            console.warn('[audit] Failed to log action:', action, error.message);
          }
        })
        .catch((err: unknown) => {
          // Network error or other exception — log and continue
          console.warn('[audit] Exception during log:', action, err);
        });
    },
    [organizationId, userId],
  );

  return { log };
}
