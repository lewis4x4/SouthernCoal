import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { DiscrepancyRow, DiscrepancyStatus } from '@/stores/reviewQueue';

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export function useDiscrepancies() {
  const [rows, setRows] = useState<DiscrepancyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<SeverityCounts>({ critical: 0, high: 0, medium: 0, low: 0 });
  const { log } = useAuditLog();

  const fetchDiscrepancies = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchErr } = await supabase
      .from('discrepancy_reviews')
      .select('*')
      .order('detected_at', { ascending: false });

    if (fetchErr) {
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    const typed = (data || []) as DiscrepancyRow[];
    setRows(typed);

    // Compute severity counts for pending/reviewed only
    const active = typed.filter((r) => r.status === 'pending' || r.status === 'reviewed');
    setCounts({
      critical: active.filter((r) => r.severity === 'critical').length,
      high: active.filter((r) => r.severity === 'high').length,
      medium: active.filter((r) => r.severity === 'medium').length,
      low: active.filter((r) => r.severity === 'low').length,
    });

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDiscrepancies();
  }, [fetchDiscrepancies]);

  const updateStatus = useCallback(
    async (
      id: string,
      status: DiscrepancyStatus,
      extra?: { review_notes?: string; dismiss_reason?: string },
    ) => {
      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'reviewed' || status === 'dismissed') {
        updates.reviewed_at = new Date().toISOString();
      }
      if (status === 'dismissed' && extra?.dismiss_reason) {
        updates.dismiss_reason = extra.dismiss_reason;
      }
      if (extra?.review_notes) {
        updates.review_notes = extra.review_notes;
      }
      if (status === 'resolved') {
        updates.resolved_at = new Date().toISOString();
      }

      const { error: updateErr } = await supabase
        .from('discrepancy_reviews')
        .update(updates)
        .eq('id', id);

      if (updateErr) {
        return updateErr.message;
      }

      // Audit log
      const actionMap: Record<string, string> = {
        reviewed: 'discrepancy_reviewed',
        dismissed: 'discrepancy_dismissed',
        escalated: 'discrepancy_escalated',
        resolved: 'discrepancy_resolved',
      };
      const action = actionMap[status];
      if (action) {
        log(action as Parameters<typeof log>[0], { discrepancy_id: id, status, ...extra }, {
          module: 'external_data',
          tableName: 'discrepancy_reviews',
          recordId: id,
        });
      }

      // Refresh
      await fetchDiscrepancies();
      return null;
    },
    [fetchDiscrepancies, log],
  );

  return { rows, loading, error, counts, refetch: fetchDiscrepancies, updateStatus };
}
