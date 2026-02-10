import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

type AuditAction =
  | 'matrix_export_csv'
  | 'matrix_export_markdown'
  | 'bulk_process'
  | 'bulk_retry'
  | 'staging_clear_all'
  | 'command_palette_action'
  | 'filter_change'
  | 'obligation_generation'
  | 'deadline_alert_sent';

/**
 * Frontend audit logging — v6 override of v5.
 * Logs UI-only actions that Edge Functions never see.
 * Fire-and-forget: never blocks UI on insert failure.
 */
export function useAuditLog() {
  const { user } = useAuth();

  const log = useCallback(
    (action: AuditAction, details?: Record<string, unknown>) => {
      if (!user) return;

      // Fire-and-forget — catch + warn, never block UI
      supabase
        .from('audit_log')
        .insert({
          user_id: user.id,
          action,
          details: details ?? {},
          created_at: new Date().toISOString(),
        })
        .then(({ error }) => {
          if (error) {
            console.warn('[audit] Failed to log action:', action, error.message);
          }
        });
    },
    [user],
  );

  return { log };
}
