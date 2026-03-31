import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { GovernanceIssueEventRecord, GovernanceIssueRecord, GovernanceIssueStatus } from '@/types';

const STEP_ONE_OWNER = 'Bill Johnson';

/** Inbox slice — Codex Phase 5 visibility beyond the primary reviewer queue */
export type GovernanceInboxFilter = 'bill_primary' | 'all_open' | 'escalated';

const ACTIVE_STATUSES: GovernanceIssueStatus[] = ['open', 'under_review'];

export function useGovernanceIssues() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [issues, setIssues] = useState<GovernanceIssueRecord[]>([]);
  const [events, setEvents] = useState<Record<string, GovernanceIssueEventRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [inboxFilter, setInboxFilter] = useState<GovernanceInboxFilter>('bill_primary');
  const organizationId = profile?.organization_id ?? null;
  const actorName = user?.email ?? 'System';

  const loadIssues = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    let q = supabase
      .from('governance_issues')
      .select('*')
      .eq('organization_id', organizationId)
      .in('current_status', ACTIVE_STATUSES);

    if (inboxFilter === 'bill_primary') {
      q = q.eq('current_step', 1).eq('current_owner_name', STEP_ONE_OWNER);
    } else if (inboxFilter === 'escalated') {
      q = q.gt('current_step', 1);
    }
    // all_open: org + active statuses only

    const { data, error } = await q.order('raised_at', { ascending: false });

    if (error) {
      toast.error(`Failed to load governance issues: ${error.message}`);
      setLoading(false);
      return;
    }

    setIssues((data ?? []) as GovernanceIssueRecord[]);
    setLoading(false);
  }, [organizationId, inboxFilter]);

  const loadEvents = useCallback(async (issueId: string) => {
    const { data, error } = await supabase
      .from('governance_issue_events')
      .select('*')
      .eq('governance_issue_id', issueId)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error(`Failed to load governance issue events: ${error.message}`);
      return;
    }

    setEvents((prev) => ({ ...prev, [issueId]: (data ?? []) as GovernanceIssueEventRecord[] }));
  }, []);

  const updateIssue = useCallback(async (issue: GovernanceIssueRecord, updates: {
    currentStatus: GovernanceIssueStatus;
    finalDisposition?: string;
    notes?: string;
  }) => {
    if (!user?.id) throw new Error('Missing user context');

    const { error } = await supabase.rpc('update_governance_issue_status', {
      p_issue_id: issue.id,
      p_current_status: updates.currentStatus,
      p_final_disposition: updates.finalDisposition ?? null,
      p_notes: updates.notes ?? null,
      p_actor_name: actorName,
    });

    if (error) throw new Error(error.message);

    await Promise.all([loadIssues(), loadEvents(issue.id)]);
  }, [actorName, loadEvents, loadIssues, user?.id]);

  useEffect(() => {
    if (organizationId) {
      loadIssues().catch((err) => {
        console.error('[useGovernanceIssues] Failed to load issues:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to load governance issues');
      });
    }
  }, [loadIssues, organizationId]);

  return {
    issues,
    events,
    loading,
    inboxFilter,
    setInboxFilter,
    refresh: loadIssues,
    loadEvents,
    updateIssue,
  };
}
