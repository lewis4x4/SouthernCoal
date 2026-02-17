import { useCallback, useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { ExceedanceWithRelations, ExceedanceStatus, ExceedanceSeverity } from '@/types';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface ExceedanceFilters {
  status?: ExceedanceStatus | 'all';
  severity?: ExceedanceSeverity | 'all';
  outfallId?: string;
  parameterId?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface UseExceedancesReturn {
  exceedances: ExceedanceWithRelations[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  acknowledgeExceedance: (id: string) => Promise<void>;
  resolveExceedance: (id: string, notes?: string) => Promise<void>;
  markFalsePositive: (id: string, notes?: string) => Promise<void>;
}

/**
 * Hook for fetching and managing exceedances with realtime updates.
 * Supports filtering by status, severity, outfall, parameter, and date range.
 */
export function useExceedances(filters?: ExceedanceFilters): UseExceedancesReturn {
  const [exceedances, setExceedances] = useState<ExceedanceWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { profile } = useUserProfile();

  const fetchExceedances = useCallback(async () => {
    if (!profile?.organization_id) {
      setExceedances([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('exceedances')
        .select(`
          *,
          outfall:outfalls (
            outfall_number,
            permit_id
          ),
          parameter:parameters (
            name,
            short_name
          ),
          lab_result:lab_results (
            sampling_event_id,
            unit
          ),
          permit_limit:permit_limits (
            limit_type,
            unit
          ),
          corrective_action:corrective_actions (
            id,
            title,
            status
          )
        `)
        .eq('organization_id', profile.organization_id)
        .order('detected_at', { ascending: false });

      // Apply filters
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.severity && filters.severity !== 'all') {
        query = query.eq('severity', filters.severity);
      }
      if (filters?.outfallId) {
        query = query.eq('outfall_id', filters.outfallId);
      }
      if (filters?.parameterId) {
        query = query.eq('parameter_id', filters.parameterId);
      }
      if (filters?.dateFrom) {
        query = query.gte('sample_date', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('sample_date', filters.dateTo);
      }

      const { data, error: queryError } = await query.limit(500);

      if (queryError) {
        throw queryError;
      }

      setExceedances(data as ExceedanceWithRelations[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch exceedances';
      setError(message);
      console.error('[useExceedances] Error:', message);
    } finally {
      setLoading(false);
    }
  }, [profile?.organization_id, filters]);

  // Initial fetch
  useEffect(() => {
    fetchExceedances();
  }, [fetchExceedances]);

  // Realtime subscription for exceedances in user's org
  const lastEventRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!profile?.organization_id) return;

    const channel = supabase
      .channel('exceedances-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'exceedances',
          filter: `organization_id=eq.${profile.organization_id}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          lastEventRef.current = Date.now();

          // Refresh on any change
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
            fetchExceedances();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.organization_id, fetchExceedances]);

  /**
   * Acknowledge an exceedance (changes status to 'acknowledged')
   */
  const acknowledgeExceedance = useCallback(async (id: string) => {
    const { error: updateError } = await supabase
      .from('exceedances')
      .update({
        status: 'acknowledged',
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: profile?.id,
      })
      .eq('id', id);

    if (updateError) {
      throw new Error(`Failed to acknowledge exceedance: ${updateError.message}`);
    }

    // Optimistic update
    setExceedances((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, status: 'acknowledged' as const } : e
      )
    );
  }, [profile?.id]);

  /**
   * Resolve an exceedance with optional notes
   */
  const resolveExceedance = useCallback(async (id: string, notes?: string) => {
    const { error: updateError } = await supabase
      .from('exceedances')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolved_by: profile?.id,
        resolution_notes: notes || null,
      })
      .eq('id', id);

    if (updateError) {
      throw new Error(`Failed to resolve exceedance: ${updateError.message}`);
    }

    // Optimistic update
    setExceedances((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, status: 'resolved' as const } : e
      )
    );
  }, [profile?.id]);

  /**
   * Mark an exceedance as a false positive
   */
  const markFalsePositive = useCallback(async (id: string, notes?: string) => {
    const { error: updateError } = await supabase
      .from('exceedances')
      .update({
        status: 'false_positive',
        resolved_at: new Date().toISOString(),
        resolved_by: profile?.id,
        resolution_notes: notes || null,
      })
      .eq('id', id);

    if (updateError) {
      throw new Error(`Failed to mark false positive: ${updateError.message}`);
    }

    // Optimistic update
    setExceedances((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, status: 'false_positive' as const } : e
      )
    );
  }, [profile?.id]);

  return {
    exceedances,
    loading,
    error,
    refresh: fetchExceedances,
    acknowledgeExceedance,
    resolveExceedance,
    markFalsePositive,
  };
}
