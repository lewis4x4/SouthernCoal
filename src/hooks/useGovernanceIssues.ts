import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { GovernanceIssueEventRecord, GovernanceIssueRecord, GovernanceIssueStatus } from '@/types';

/** Fallback when no governance_escalation_config row exists for step 1. */
const DEFAULT_STEP_ONE_OWNER = 'Bill Johnson';

export interface EscalationConfigEntry {
  step_number: number;
  owner_name: string;
  owner_role: string;
  sla_hours: number;
}

/** Inbox slice — Codex Phase 5 visibility beyond the primary reviewer queue */
export type GovernanceInboxFilter = 'bill_primary' | 'all_open' | 'escalated';

const ACTIVE_STATUSES: GovernanceIssueStatus[] = ['open', 'under_review'];

export function useGovernanceIssues() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [issues, setIssues] = useState<GovernanceIssueRecord[]>([]);
  const [events, setEvents] = useState<Record<string, GovernanceIssueEventRecord[]>>({});
  const [escalationConfig, setEscalationConfig] = useState<EscalationConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [inboxFilter, setInboxFilter] = useState<GovernanceInboxFilter>('bill_primary');
  const organizationId = profile?.organization_id ?? null;
  const actorName = user?.email ?? 'System';

  /** Resolve step-1 owner name from config or fallback. */
  const step1OwnerName = escalationConfig.find((c) => c.step_number === 1)?.owner_name ?? DEFAULT_STEP_ONE_OWNER;

  const loadEscalationConfig = useCallback(async () => {
    if (!organizationId) {
      setEscalationConfig([]);
      return;
    }
    const { data, error } = await supabase
      .from('governance_escalation_config')
      .select('step_number, owner_name, owner_role, sla_hours')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('step_number', { ascending: true });

    if (error) {
      console.warn('[useGovernanceIssues] Failed to load escalation config:', error.message);
      setEscalationConfig([]);
      return;
    }
    setEscalationConfig((data ?? []) as EscalationConfigEntry[]);
  }, [organizationId]);

  const loadIssues = useCallback(async () => {
    if (!organizationId) {
      setIssues([]);
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
      q = q.eq('current_step', 1).eq('current_owner_name', step1OwnerName);
    } else if (inboxFilter === 'escalated') {
      q = q.gt('current_step', 1);
    }
    // all_open: org + active statuses only

    const { data, error } = await q.order('raised_at', { ascending: false }).limit(500);

    if (error) {
      toast.error(`Failed to load governance issues: ${error.message}`);
      setIssues([]);
      setLoading(false);
      return;
    }

    setIssues((data ?? []) as GovernanceIssueRecord[]);
    setLoading(false);
  }, [organizationId, inboxFilter, step1OwnerName]);

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
    if (!organizationId) {
      setIssues([]);
      setLoading(false);
      return;
    }
    loadEscalationConfig().catch((err) => {
      console.warn('[useGovernanceIssues] escalation config load failed:', err);
    });
  }, [loadEscalationConfig, organizationId]);

  useEffect(() => {
    if (!organizationId) {
      setIssues([]);
      setLoading(false);
      return;
    }
    loadIssues().catch((err) => {
      console.error('[useGovernanceIssues] Failed to load issues:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to load governance issues');
    });
  }, [loadIssues, organizationId]);

  return {
    issues,
    events,
    escalationConfig,
    loading,
    inboxFilter,
    setInboxFilter,
    step1OwnerName,
    refresh: loadIssues,
    loadEvents,
    updateIssue,
  };
}
