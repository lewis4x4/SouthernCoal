import { useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import {
  useCorrectiveActionsStore,
  filterActions,
  getStatusCounts,
  getOverdueCount,
} from '@/stores/correctiveActions';
import type { CorrectiveAction, CAActivity, WorkflowStep } from '@/types/corrective-actions';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

/**
 * Main hook for Corrective Actions data management.
 * Handles fetching, Realtime subscriptions, and mutations.
 */
export function useCorrectiveActions() {
  const { user } = useAuth();
  const { log } = useAuditLog();

  const {
    actions,
    filters,
    activities,
    loading,
    error,
    setActions,
    upsertAction,
    setActivities,
    setLoading,
    setError,
  } = useCorrectiveActionsStore();

  const loadingRef = useRef(false);
  // Use ref to always get latest fetchActions in Realtime callback
  const fetchActionsRef = useRef<(() => Promise<void>) | null>(null);

  // -------------------------------------------------------------------------
  // Fetch all CAs for the user's organization
  // -------------------------------------------------------------------------
  const fetchActions = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const { data, error: fetchErr } = await supabase
      .from('corrective_actions')
      .select(
        `
        *,
        organization:organizations(name),
        site:sites(name),
        permit:npdes_permits(permit_number),
        assigned_user:user_profiles!followup_assigned_to(first_name, last_name),
        responsible_person:user_profiles!responsible_person_id(first_name, last_name),
        approver:user_profiles!approved_by_id(first_name, last_name)
      `
      )
      .order('created_at', { ascending: false });

    loadingRef.current = false;

    if (fetchErr) {
      console.error('[useCorrectiveActions] Fetch error:', fetchErr.message);
      setError(fetchErr.message);
      setLoading(false);
      return;
    }

    // Map JOINed data to flat fields for easier rendering
    const mapped: CorrectiveAction[] = (data || []).map((row) => ({
      ...row,
      organization_name: row.organization?.name ?? null,
      site_name: row.site?.name ?? null,
      permit_number: row.permit?.permit_number ?? null,
      assigned_to_name: row.assigned_user
        ? `${row.assigned_user.first_name} ${row.assigned_user.last_name}`
        : null,
      responsible_person_name: row.responsible_person
        ? `${row.responsible_person.first_name} ${row.responsible_person.last_name}`
        : null,
      approved_by_name: row.approver
        ? `${row.approver.first_name} ${row.approver.last_name}`
        : null,
    }));

    setActions(mapped);
    setLoading(false);
  }, [setActions, setLoading, setError]);

  // Keep ref updated for Realtime callback to avoid stale closure
  useEffect(() => {
    fetchActionsRef.current = fetchActions;
  }, [fetchActions]);

  // -------------------------------------------------------------------------
  // Fetch activities (audit trail) for a specific CA
  // -------------------------------------------------------------------------
  const fetchActivities = useCallback(
    async (caId: string) => {
      const { data, error: fetchErr } = await supabase
        .from('audit_log')
        .select('*, user:user_profiles(first_name, last_name)')
        .eq('table_name', 'corrective_actions')
        .eq('record_id', caId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchErr) {
        console.warn('[useCorrectiveActions] Failed to fetch activities:', fetchErr.message);
        toast.error('Failed to load activity history');
        return;
      }

      const mapped: CAActivity[] = (data || []).map((row) => ({
        id: row.id,
        corrective_action_id: caId,
        user_id: row.user_id,
        user_name: row.user
          ? `${row.user.first_name} ${row.user.last_name}`
          : 'System',
        action: row.action,
        description: row.description,
        old_values: row.old_values,
        new_values: row.new_values,
        created_at: row.created_at,
      }));

      setActivities(caId, mapped);
    },
    [setActivities]
  );

  // -------------------------------------------------------------------------
  // Update a CA record
  // -------------------------------------------------------------------------
  const updateAction = useCallback(
    async (
      caId: string,
      updates: Partial<CorrectiveAction>
    ): Promise<{ error: string | null }> => {
      const { data, error: updateErr } = await supabase
        .from('corrective_actions')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', caId)
        .select()
        .single();

      if (updateErr) {
        console.error('[useCorrectiveActions] Update error:', updateErr.message);
        return { error: updateErr.message };
      }

      if (data) {
        upsertAction(data as CorrectiveAction);
      }

      return { error: null };
    },
    [upsertAction]
  );

  // -------------------------------------------------------------------------
  // Update step-specific data
  // -------------------------------------------------------------------------
  const updateStepData = useCallback(
    async (
      caId: string,
      step: WorkflowStep,
      data: Record<string, unknown>
    ): Promise<{ error: string | null }> => {
      const result = await updateAction(caId, data as Partial<CorrectiveAction>);

      if (!result.error) {
        log(
          'corrective_action_step_data_updated',
          { ca_id: caId, step, fields: Object.keys(data) },
          {
            module: 'corrective_actions',
            tableName: 'corrective_actions',
            recordId: caId,
            newValues: data,
          }
        );
      }

      return result;
    },
    [updateAction, log]
  );

  // -------------------------------------------------------------------------
  // Initial load
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (user) {
      fetchActions();
    }
  }, [user?.id, fetchActions]);

  // Issue #13 Fix: Use useMemo for channel name - recalculates on user change (logout/login)
  const channelName = useMemo(
    () => `ca-changes-${user?.id ?? 'anon'}`,
    [user?.id]
  );

  // -------------------------------------------------------------------------
  // Realtime subscription
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'corrective_actions',
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('[useCorrectiveActions] Realtime event:', payload.eventType);

          // Refetch to get JOINed data (Realtime only sends raw row)
          // Use ref to avoid stale closure
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            fetchActionsRef.current?.();
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const deletedId = (payload.old as { id: string }).id;
            useCorrectiveActionsStore.getState().removeAction(deletedId);
          }
        }
      )
      .subscribe();

    return () => {
      // Ensure proper cleanup to prevent memory leaks
      channel.unsubscribe().then(() => {
        supabase.removeChannel(channel);
      });
    };
  }, [user?.id, channelName]); // Issue #13: Include channelName in deps

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------
  const filtered = filterActions(actions, filters);
  const statusCounts = getStatusCounts(actions);
  const overdueCount = getOverdueCount(actions);

  return {
    // Data
    actions: filtered,
    allActions: actions,
    activities,

    // State
    loading,
    error,

    // Counts
    counts: {
      ...statusCounts,
      overdue: overdueCount,
      total: actions.length,
    },

    // Methods
    refetch: fetchActions,
    fetchActivities,
    updateAction,
    updateStepData,
  };
}
