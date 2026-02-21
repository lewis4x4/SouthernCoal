import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { DiscrepancyRow, DiscrepancySeverity, DiscrepancyStatus } from '@/stores/reviewQueue';

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

const PAGE_SIZE = 500;

export function useDiscrepancies() {
  const [rows, setRows] = useState<DiscrepancyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<SeverityCounts>({ critical: 0, high: 0, medium: 0, low: 0 });
  const [totalCount, setTotalCount] = useState(0);
  const { log } = useAuditLog();
  const abortRef = useRef<AbortController | null>(null);

  // Fetch severity counts server-side (accurate across all rows, not capped by PostgREST)
  const fetchCounts = useCallback(async () => {
    const severities = ['critical', 'high', 'medium', 'low'] as const;
    const results: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

    await Promise.all(
      severities.map(async (sev) => {
        const { count } = await supabase
          .from('discrepancy_reviews')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'reviewed'])
          .eq('severity', sev);
        results[sev] = count ?? 0;
      }),
    );

    setCounts(results);
  }, []);

  const fetchDiscrepancies = useCallback(async () => {
    // Abort any in-flight pagination loop
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const allRows: DiscrepancyRow[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      if (controller.signal.aborted) return;

      const { data, error: fetchErr } = await supabase
        .from('discrepancy_reviews')
        .select('*')
        .in('status', ['pending', 'reviewed'])
        .order('severity', { ascending: true })
        .order('detected_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;

      if (fetchErr) {
        setError(fetchErr.message);
        setLoading(false);
        return;
      }

      const page = (data || []) as DiscrepancyRow[];
      allRows.push(...page);
      hasMore = page.length === PAGE_SIZE;
      offset += PAGE_SIZE;
    }

    if (controller.signal.aborted) return;

    setRows(allRows);
    setTotalCount(allRows.length);

    await fetchCounts();

    setLoading(false);
  }, [fetchCounts]);

  useEffect(() => {
    fetchDiscrepancies();
    return () => { abortRef.current?.abort(); };
  }, [fetchDiscrepancies]);

  const updateStatus = useCallback(
    async (
      id: string,
      status: DiscrepancyStatus,
      extra?: { review_notes?: string; dismiss_reason?: string },
    ) => {
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        status,
        updated_at: now,
      };

      if (status === 'reviewed' || status === 'dismissed') {
        updates.reviewed_at = now;
      }
      if (status === 'dismissed' && extra?.dismiss_reason) {
        updates.dismiss_reason = extra.dismiss_reason;
      }
      if (extra?.review_notes) {
        updates.review_notes = extra.review_notes;
      }
      if (status === 'resolved') {
        updates.resolved_at = now;
      }

      const { error: updateErr } = await supabase
        .from('discrepancy_reviews')
        .update(updates)
        .eq('id', id);

      if (updateErr) {
        return updateErr.message;
      }

      // Optimistic local update instead of full re-fetch
      setRows((prev) => {
        const isActionable = status === 'pending' || status === 'reviewed';
        if (!isActionable) {
          // Row leaves the actionable set — remove it
          return prev.filter((r) => r.id !== id);
        }
        // Row stays visible — update it in place
        return prev.map((r) =>
          r.id === id ? { ...r, status, ...(extra?.review_notes ? { review_notes: extra.review_notes } : {}), ...(extra?.dismiss_reason ? { dismiss_reason: extra.dismiss_reason } : {}), updated_at: now } as DiscrepancyRow : r,
        );
      });

      // Update counts optimistically
      setCounts((prev) => {
        const row = rows.find((r) => r.id === id);
        if (!row) return prev;
        const sev = row.severity as DiscrepancySeverity;
        const isLeaving = status !== 'pending' && status !== 'reviewed';
        if (isLeaving && prev[sev] > 0) {
          return { ...prev, [sev]: prev[sev] - 1 };
        }
        return prev;
      });

      setTotalCount((prev) => {
        const isLeaving = status !== 'pending' && status !== 'reviewed';
        return isLeaving ? Math.max(0, prev - 1) : prev;
      });

      // Audit log (fire-and-forget)
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

      return null;
    },
    [rows, log],
  );

  return { rows, loading, error, counts, totalCount, refetch: fetchDiscrepancies, updateStatus };
}
