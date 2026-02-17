import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { HandoffHistoryRecord, AITaskMatch } from '@/types/handoff';

export function useHandoffHistory() {
  const { user } = useAuth();
  const { log } = useAuditLog();
  const [history, setHistory] = useState<HandoffHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch history on mount and when user changes
  useEffect(() => {
    if (!user) {
      setHistory([]);
      setLoading(false);
      return;
    }

    const fetchHistory = async () => {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('handoff_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) {
        setError(fetchError.message);
        toast.error('Failed to load handoff history');
      } else {
        setHistory((data ?? []) as HandoffHistoryRecord[]);
      }

      setLoading(false);
    };

    fetchHistory();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('handoff_history_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'handoff_history',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setHistory((prev) => [payload.new as HandoffHistoryRecord, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setHistory((prev) =>
              prev.map((h) =>
                h.id === payload.new.id ? (payload.new as HandoffHistoryRecord) : h
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setHistory((prev) => prev.filter((h) => h.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  /**
   * Apply all task matches from a handoff record
   */
  const applyMatches = useCallback(
    async (handoffId: string) => {
      if (!user) {
        toast.error('Must be logged in');
        return;
      }

      const record = history.find((h) => h.id === handoffId);
      if (!record) {
        toast.error('Handoff record not found');
        return;
      }

      if (record.status !== 'pending_review') {
        toast.warning('This handoff has already been processed');
        return;
      }

      const appliedIds: string[] = [];
      let errorCount = 0;

      for (const match of record.task_matches as AITaskMatch[]) {
        try {
          // Update task status and/or notes
          const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };

          if (match.proposed_status) {
            updates.status = match.proposed_status;
          }

          if (match.proposed_notes) {
            // Get existing notes first
            const { data: existingTask } = await supabase
              .from('roadmap_tasks')
              .select('notes')
              .eq('id', match.task_id)
              .single();

            const existingNotes = existingTask?.notes || '';
            const separator = existingNotes ? '\n\n---\n\n' : '';
            updates.notes = `${existingNotes}${separator}**Handoff Update (${new Date().toLocaleDateString()}):**\n${match.proposed_notes}`;
          }

          const { error: updateError } = await supabase
            .from('roadmap_tasks')
            .update(updates)
            .eq('id', match.task_id);

          if (updateError) {
            console.error(`Failed to update task ${match.task_number}:`, updateError);
            errorCount++;
          } else {
            appliedIds.push(match.task_id);
          }
        } catch (err) {
          console.error(`Error applying match for task ${match.task_number}:`, err);
          errorCount++;
        }
      }

      // Update handoff record status
      const { error: statusError } = await supabase
        .from('handoff_history')
        .update({
          status: errorCount === 0 ? 'approved' : 'partial',
          applied_task_ids: appliedIds,
          applied_at: new Date().toISOString(),
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', handoffId);

      if (statusError) {
        toast.error('Failed to update handoff status');
        return;
      }

      log('handoff_applied', {
        handoff_id: handoffId,
        applied_count: appliedIds.length,
        error_count: errorCount,
        task_ids: appliedIds,
      });

      if (errorCount === 0) {
        toast.success(`Applied ${appliedIds.length} task update(s)`);
      } else {
        toast.warning(`Applied ${appliedIds.length}, failed ${errorCount}`);
      }
    },
    [user, history, log]
  );

  /**
   * Reject a handoff record
   */
  const rejectHandoff = useCallback(
    async (handoffId: string, notes?: string) => {
      if (!user) {
        toast.error('Must be logged in');
        return;
      }

      const { error: updateError } = await supabase
        .from('handoff_history')
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes,
        })
        .eq('id', handoffId);

      if (updateError) {
        toast.error('Failed to reject handoff');
        return;
      }

      log('handoff_rejected', {
        handoff_id: handoffId,
        notes,
      });

      toast.info('Handoff rejected');
    },
    [user, log]
  );

  /**
   * Apply a single task match from a handoff
   */
  const applySingleMatch = useCallback(
    async (handoffId: string, matchIndex: number) => {
      if (!user) {
        toast.error('Must be logged in');
        return;
      }

      const record = history.find((h) => h.id === handoffId);
      if (!record) {
        toast.error('Handoff record not found');
        return;
      }

      const match = (record.task_matches as AITaskMatch[])[matchIndex];
      if (!match) {
        toast.error('Task match not found');
        return;
      }

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (match.proposed_status) {
        updates.status = match.proposed_status;
      }

      if (match.proposed_notes) {
        const { data: existingTask } = await supabase
          .from('roadmap_tasks')
          .select('notes')
          .eq('id', match.task_id)
          .single();

        const existingNotes = existingTask?.notes || '';
        const separator = existingNotes ? '\n\n---\n\n' : '';
        updates.notes = `${existingNotes}${separator}**Handoff Update (${new Date().toLocaleDateString()}):**\n${match.proposed_notes}`;
      }

      const { error: updateError } = await supabase
        .from('roadmap_tasks')
        .update(updates)
        .eq('id', match.task_id);

      if (updateError) {
        toast.error(`Failed to update task ${match.task_number}`);
        return;
      }

      // Update the handoff record's applied_task_ids
      const newAppliedIds = [...(record.applied_task_ids || []), match.task_id];
      await supabase
        .from('handoff_history')
        .update({
          applied_task_ids: newAppliedIds,
          applied_at: new Date().toISOString(),
        })
        .eq('id', handoffId);

      log('handoff_single_match_applied', {
        handoff_id: handoffId,
        task_id: match.task_id,
        task_number: match.task_number,
      });

      toast.success(`Applied update to task ${match.task_number}`);
    },
    [user, history, log]
  );

  /**
   * Get pending handoffs count
   */
  const pendingCount = history.filter((h) => h.status === 'pending_review').length;

  return {
    history,
    loading,
    error,
    pendingCount,
    applyMatches,
    rejectHandoff,
    applySingleMatch,
  };
}
