import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  action: string;
  module: string;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  description: string | null;
  created_at: string;
}

export interface AuditLogFilters {
  dateFrom: string | null;
  dateTo: string | null;
  userId: string | null;
  module: string | null;
  action: string | null;
}

const PAGE_SIZE = 50;

export function useAuditLogQuery(filters: AuditLogFilters) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    setLoading(true);
    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (filters.dateFrom) {
      query = query.gte('created_at', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte('created_at', filters.dateTo + 'T23:59:59.999Z');
    }
    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }
    if (filters.module) {
      query = query.eq('module', filters.module);
    }
    if (filters.action) {
      query = query.eq('action', filters.action);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[audit-log-query] Failed:', error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as AuditLogEntry[];
    setEntries(prev => append ? [...prev, ...rows] : rows);
    setHasMore(rows.length === PAGE_SIZE);
    if (count !== null) setTotalCount(count);
    setLoading(false);
  }, [filters.dateFrom, filters.dateTo, filters.userId, filters.module, filters.action]);

  // Reset and fetch first page when filters change
  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    fetchPage(entries.length, true);
  }, [hasMore, loading, entries.length, fetchPage]);

  return { entries, loading, hasMore, totalCount, loadMore };
}
