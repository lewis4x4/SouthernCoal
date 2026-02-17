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
  | 'roadmap_report_exported';

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

  const log = useCallback(
    (action: AuditAction, details?: Record<string, unknown>, entity?: AuditEntity) => {
      if (!user) return;

      // Fire-and-forget — wrap in Promise to ensure .catch() is available
      Promise.resolve(
        supabase
          .from('audit_log')
          .insert({
            user_id: user.id,
            organization_id: profile?.organization_id ?? null,
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
    [user, profile],
  );

  return { log };
}
