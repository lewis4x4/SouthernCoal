import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
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
  const [pendingCount, setPendingCount] = useState(0);
  const [escalatedCount, setEscalatedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const abortRef = useRef<AbortController | null>(null);
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchHandlersRef = useRef<{ fetchRows: () => Promise<void>; fetchCounts: () => Promise<void> }>({
    fetchRows: async () => {},
    fetchCounts: async () => {},
  });
  const userId = user?.id ?? null;
  const orgId = profile?.organization_id ?? null;

  // Fetch severity counts server-side (accurate across all rows, not capped by PostgREST)
  const fetchCounts = useCallback(async () => {
    const severities = ['critical', 'high', 'medium', 'low'] as const;
    const results: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

    await Promise.all(
      severities.map(async (sev) => {
        const { count } = await supabase
          .from('discrepancy_reviews')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'reviewed', 'escalated'])
          .eq('severity', sev);
        results[sev] = count ?? 0;
      }),
    );

    setCounts(results);

    const [{ count: pending }, { count: escalated }] = await Promise.all([
      supabase
        .from('discrepancy_reviews')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('discrepancy_reviews')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'escalated'),
    ]);
    setPendingCount(pending ?? 0);
    setEscalatedCount(escalated ?? 0);
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
        .in('status', ['pending', 'reviewed', 'escalated'])
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

  fetchHandlersRef.current = {
    fetchRows: fetchDiscrepancies,
    fetchCounts,
  };

  useEffect(() => {
    fetchDiscrepancies();
    return () => { abortRef.current?.abort(); };
  }, [fetchDiscrepancies]);

  // 3.47 — org-scoped realtime refresh (debounced; detection/sync can insert many rows)
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`discrepancy-reviews:${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'discrepancy_reviews',
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = setTimeout(() => {
            void fetchHandlersRef.current.fetchCounts();
            void fetchHandlersRef.current.fetchRows();
          }, 1500);
        },
      )
      .subscribe();

    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      void supabase.removeChannel(channel).catch((err) => {
        if (import.meta.env.DEV) {
          console.warn('[useDiscrepancies] removeChannel failed', err);
        }
      });
    };
  }, [orgId]);

  const updateStatus = useCallback(
    async (
      id: string,
      status: DiscrepancyStatus,
      extra?: { review_notes?: string; dismiss_reason?: string },
    ) => {
      const recordsActor =
        status === 'reviewed' ||
        status === 'dismissed' ||
        status === 'escalated' ||
        status === 'resolved';
      if (recordsActor && !userId) {
        return 'Sign in to record who performed this review action';
      }

      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        status,
        updated_at: now,
      };

      if (status === 'reviewed' || status === 'dismissed') {
        updates.reviewed_at = now;
        updates.reviewed_by = userId;
      }
      if (status === 'dismissed' && extra?.dismiss_reason) {
        updates.dismiss_reason = extra.dismiss_reason;
      }
      if (extra?.review_notes) {
        updates.review_notes = extra.review_notes;
      }
      if (status === 'escalated') {
        updates.escalated_at = now;
        updates.reviewed_by = userId;
      }
      if (status === 'resolved') {
        updates.resolved_at = now;
        updates.reviewed_by = userId;
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
        const staysInQueue =
          status === 'pending' || status === 'reviewed' || status === 'escalated';
        if (!staysInQueue) {
          return prev.filter((r) => r.id !== id);
        }
        // Row stays visible — update it in place
        return prev.map((r) => {
          if (r.id !== id) return r;
          const next: DiscrepancyRow = {
            ...r,
            status,
            updated_at: now,
            ...(extra?.review_notes !== undefined ? { review_notes: extra.review_notes || null } : {}),
            ...(extra?.dismiss_reason !== undefined ? { dismiss_reason: extra.dismiss_reason || null } : {}),
          };
          if (status === 'reviewed' || status === 'escalated') {
            next.reviewed_at = now;
            next.reviewed_by = userId;
          }
          if (status === 'escalated') {
            next.escalated_at = now;
          }
          return next;
        });
      });

      if (status === 'reviewed' && rows.find((r) => r.id === id)?.status === 'pending') {
        setPendingCount((prev) => Math.max(0, prev - 1));
      }
      if (status === 'escalated') {
        setEscalatedCount((prev) => prev + 1);
      }

      setCounts((prev) => {
        const row = rows.find((r) => r.id === id);
        if (!row) return prev;
        const sev = row.severity as DiscrepancySeverity;
        const isLeaving = status === 'dismissed' || status === 'resolved';
        if (isLeaving && prev[sev] > 0) {
          return { ...prev, [sev]: prev[sev] - 1 };
        }
        return prev;
      });

      setTotalCount((prev) => {
        const isLeaving = status === 'dismissed' || status === 'resolved';
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
    [log, rows, userId],
  );

  const bulkMarkReviewed = useCallback(
    async (ids: string[]) => {
      if (!userId) {
        return 'Sign in to record who performed this review action';
      }
      const pendingIds = ids.filter((id) => {
        const row = rows.find((r) => r.id === id);
        return row?.status === 'pending';
      });
      if (pendingIds.length === 0) {
        return 'No pending discrepancies selected';
      }

      const now = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from('discrepancy_reviews')
        .update({
          status: 'reviewed',
          reviewed_at: now,
          reviewed_by: userId,
          updated_at: now,
        })
        .in('id', pendingIds)
        .eq('status', 'pending');

      if (updateErr) {
        return updateErr.message;
      }

      setRows((prev) =>
        prev.map((r) =>
          pendingIds.includes(r.id)
            ? {
                ...r,
                status: 'reviewed' as const,
                reviewed_at: now,
                reviewed_by: userId,
                updated_at: now,
              }
            : r,
        ),
      );

      setPendingCount((prev) => Math.max(0, prev - pendingIds.length));

      log(
        'discrepancy_reviewed',
        {
          bulk: true,
          count: pendingIds.length,
          discrepancy_ids: pendingIds.slice(0, 25),
        },
        { module: 'external_data', tableName: 'discrepancy_reviews' },
      );

      return null;
    },
    [log, rows, userId],
  );

  return {
    rows,
    loading,
    error,
    counts,
    pendingCount,
    escalatedCount,
    totalCount,
    refetch: fetchDiscrepancies,
    updateStatus,
    bulkMarkReviewed,
  };
}
