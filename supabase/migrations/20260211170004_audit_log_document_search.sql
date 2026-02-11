-- Migration 012: Add document_search + generate_embedding to audit_log CHECK constraint
-- Required for Layer 3 Document Intelligence (RAG) audit trail

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;

ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (
  action = ANY (ARRAY[
    -- Base CRUD / auth actions
    'create'::text, 'update'::text, 'delete'::text, 'view'::text,
    'export'::text, 'approve'::text, 'reject'::text, 'submit'::text,
    'upload'::text, 'download'::text, 'login'::text, 'logout'::text,
    'alert_triggered'::text, 'alert_acknowledged'::text,
    -- Compliance search (Edge Function + frontend)
    'compliance_search'::text, 'compliance_search_export'::text,
    -- Document search (Layer 3 RAG)
    'document_search'::text, 'generate_embedding'::text,
    -- Upload dashboard actions
    'matrix_export_csv'::text, 'matrix_export_markdown'::text,
    'bulk_process'::text, 'bulk_retry'::text,
    'staging_clear_all'::text, 'command_palette_action'::text,
    'filter_change'::text,
    -- Obligations / alerts
    'obligation_generation'::text, 'deadline_alert_sent'::text,
    -- Coverage / exports
    'coverage_export_csv'::text, 'audit_log_export_csv'::text,
    -- Access control
    'role_change'::text, 'user_deactivated'::text,
    'user_reactivated'::text, 'access_review_completed'::text,
    -- Data corrections
    'correction_requested'::text, 'correction_approved'::text,
    'correction_rejected'::text,
    -- Roadmap
    'roadmap_status_change'::text, 'roadmap_evidence_upload'::text,
    'evidence_uploaded'::text
  ])
);
