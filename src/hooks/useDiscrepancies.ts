import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useReviewQueueStore } from '@/stores/reviewQueue';
import {
  DISCREPANCY_PAGE_SIZE,
  MAX_DISCREPANCY_TABLE_ROWS,
  QUEUE_TABLE_STATUSES,
  resolveDiscrepancyStatusFilter,
} from '@/lib/discrepancyListQuery';
import type { DiscrepancyRow, DiscrepancySeverity, DiscrepancyStatus } from '@/stores/reviewQueue';

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

const PAGE_SIZE = DISCREPANCY_PAGE_SIZE;

export function useDiscrepancies() {
  const filters = useReviewQueueStore((s) => s.filters);
  const [rows, setRows] = useState<DiscrepancyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [counts, setCounts] = useState<SeverityCounts>({ critical: 0, high: 0, medium: 0, low: 0 });
  const [pendingCount, setPendingCount] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [escalatedCount, setEscalatedCount] = useState(0);
  const [statusMismatchPendingCount, setStatusMismatchPendingCount] = useState(0);
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
        let q = supabase
          .from('discrepancy_reviews')
          .select('id', { count: 'exact', head: true })
          .in('status', QUEUE_TABLE_STATUSES)
          .eq('severity', sev);
        if (orgId) q = q.eq('organization_id', orgId);
        const { count } = await q;
        results[sev] = count ?? 0;
      }),
    );

    setCounts(results);

    let pendingQ = supabase
      .from('discrepancy_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    let reviewedQ = supabase
      .from('discrepancy_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'reviewed');
    let escalatedQ = supabase
      .from('discrepancy_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'escalated');
    if (orgId) {
      pendingQ = pendingQ.eq('organization_id', orgId);
      reviewedQ = reviewedQ.eq('organization_id', orgId);
      escalatedQ = escalatedQ.eq('organization_id', orgId);
    }
    const [{ count: pending }, { count: reviewed }, { count: escalated }, { count: statusMismatch }] =
      await Promise.all([
      pendingQ,
      reviewedQ,
      escalatedQ,
      (() => {
        let q = supabase
          .from('discrepancy_reviews')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .eq('discrepancy_type', 'status_mismatch');
        if (orgId) q = q.eq('organization_id', orgId);
        return q;
      })(),
    ]);
    setPendingCount(pending ?? 0);
    setReviewedCount(reviewed ?? 0);
    setEscalatedCount(escalated ?? 0);
    setStatusMismatchPendingCount(statusMismatch ?? 0);
  }, [orgId]);

  const fetchDiscrepancies = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setTruncated(false);

    const statusFilter = resolveDiscrepancyStatusFilter(filters);

    let countQuery = supabase
      .from('discrepancy_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('status', statusFilter);
    if (orgId) countQuery = countQuery.eq('organization_id', orgId);
    if (filters.severity) countQuery = countQuery.eq('severity', filters.severity);
    if (filters.source) countQuery = countQuery.eq('source', filters.source);
    if (filters.type) countQuery = countQuery.eq('discrepancy_type', filters.type);

    const { count: matchCount, error: countErr } = await countQuery;
    if (controller.signal.aborted) return;
    if (countErr) {
      setError(countErr.message);
      setLoading(false);
      return;
    }

    const totalMatches = matchCount ?? 0;
    setFilteredTotal(totalMatches);

    const allRows: DiscrepancyRow[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore && allRows.length < MAX_DISCREPANCY_TABLE_ROWS) {
      if (controller.signal.aborted) return;

      const end = offset + PAGE_SIZE - 1;
      let pageQuery = supabase
        .from('discrepancy_reviews')
        .select('*')
        .eq('status', statusFilter)
        .order('severity', { ascending: true })
        .order('detected_at', { ascending: false })
        .range(offset, end)
        .abortSignal(controller.signal);
      if (orgId) pageQuery = pageQuery.eq('organization_id', orgId);
      if (filters.severity) pageQuery = pageQuery.eq('severity', filters.severity);
      if (filters.source) pageQuery = pageQuery.eq('source', filters.source);
      if (filters.type) pageQuery = pageQuery.eq('discrepancy_type', filters.type);

      const { data, error: fetchErr } = await pageQuery;

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
    setTruncated(totalMatches > allRows.length);

    await fetchCounts();

    setLoading(false);
  }, [fetchCounts, filters, orgId]);

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
            // fetchRows already refreshes counts at the end — calling fetchCounts
            // here too doubled the count queries on every realtime burst.
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
        setReviewedCount((prev) => prev + 1);
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
      setReviewedCount((prev) => prev + pendingIds.length);

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

  const bulkMarkReviewedFiltered = useCallback(
    async (limit = 5000) => {
      if (!userId) {
        return 'Sign in to record who performed this review action';
      }
      if (!orgId) {
        return 'Organization context required';
      }

      const { data, error: rpcErr } = await supabase.rpc('bulk_mark_discrepancies_reviewed', {
        p_severity: filters.severity ?? null,
        p_source: filters.source ?? null,
        p_discrepancy_type: filters.type ?? null,
        p_limit: limit,
      });

      if (rpcErr) {
        return rpcErr.message;
      }

      const marked = Number(data ?? 0);
      if (marked === 0) {
        return 'No pending discrepancies matched the current filters';
      }

      log(
        'discrepancy_reviewed',
        {
          bulk: true,
          server_filtered: true,
          count: marked,
          filters: {
            severity: filters.severity ?? null,
            source: filters.source ?? null,
            type: filters.type ?? null,
          },
        },
        { module: 'external_data', tableName: 'discrepancy_reviews' },
      );

      await fetchDiscrepancies();
      return null;
    },
    [fetchDiscrepancies, filters, log, orgId, userId],
  );

  return {
    rows,
    loading,
    error,
    counts,
    pendingCount,
    reviewedCount,
    escalatedCount,
    statusMismatchPendingCount,
    totalCount,
    filteredTotal,
    truncated,
    refetch: fetchDiscrepancies,
    updateStatus,
    bulkMarkReviewed,
    bulkMarkReviewedFiltered,
  };
}
