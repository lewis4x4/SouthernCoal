import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useLiveProgramScope } from '@/hooks/useLiveProgramScope';
import { complianceViolationInScope } from '@/lib/liveProgramScope';
import { toast } from 'sonner';
import type {
  ComplianceViolation,
  ComplianceViolationWithRelations,
  ViolationStatus,
  NOVRecord,
  EnforcementAction,
} from '@/types/database';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useComplianceViolations() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const { scope } = useLiveProgramScope();
  const orgId = profile?.organization_id ?? null;

  const [violations, setViolations] = useState<ComplianceViolationWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Fetch Violations ────────────────────────────────────────────────────
  const fetchViolations = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('compliance_violations')
      .select(`
        *,
        site:sites(name),
        permit:npdes_permits(permit_number),
        parameter:parameters(name)
      `)
      .eq('organization_id', orgId)
      .order('violation_date', { ascending: false })
      .limit(500);

    if (error) {
      console.error('[violations] fetch error:', error.message);
      toast.error('Failed to load violations');
    } else {
      setViolations(
        (data ?? [])
          .map((v: Record<string, unknown>) => ({
            ...v,
            site_name: (v.site as Record<string, string> | null)?.name ?? null,
            permit_number: (v.permit as Record<string, string> | null)?.permit_number ?? null,
            parameter_name: (v.parameter as Record<string, string> | null)?.name ?? null,
          }))
          .filter((violation) => complianceViolationInScope(violation as ComplianceViolationWithRelations, scope)) as ComplianceViolationWithRelations[],
      );
    }
    setLoading(false);
  }, [orgId, scope]);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  // ── Realtime ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel('violations_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'compliance_violations',
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          fetchViolations();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchViolations]);

  // ── Create Violation ────────────────────────────────────────────────────
  const createViolation = useCallback(
    async (fields: Partial<ComplianceViolation>) => {
      if (!orgId || !profile) return null;
      const { data, error } = await supabase
        .from('compliance_violations')
        .insert({
          ...fields,
          organization_id: orgId,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) {
        toast.error('Failed to create violation record');
        return null;
      }

      log('violation_created', { type: fields.violation_type }, {
        module: 'compliance_violations',
        tableName: 'compliance_violations',
        recordId: data.id,
      });

      toast.success('Violation record created');
      return data;
    },
    [orgId, profile, log],
  );

  // ── Update Violation Status ─────────────────────────────────────────────
  const updateViolationStatus = useCallback(
    async (id: string, status: ViolationStatus, resolutionNotes?: string) => {
      if (!profile) return;
      const updates: Partial<ComplianceViolation> = { status };
      if (status === 'resolved' || status === 'closed') {
        updates.resolved_by = profile.id;
        updates.resolved_at = new Date().toISOString();
        if (resolutionNotes) updates.resolution_notes = resolutionNotes;
      }

      const { error } = await supabase
        .from('compliance_violations')
        .update(updates)
        .eq('id', id);

      if (error) {
        toast.error('Failed to update violation status');
        return;
      }

      log('violation_status_changed', { to: status }, {
        module: 'compliance_violations',
        tableName: 'compliance_violations',
        recordId: id,
      });

      toast.success(`Violation status updated to ${status}`);
    },
    [profile, log],
  );

  // ── NOVs ────────────────────────────────────────────────────────────────
  const fetchNOVs = useCallback(
    async (violationId?: string) => {
      if (!orgId) return [];
      let query = supabase
        .from('nov_records')
        .select('*')
        .eq('organization_id', orgId)
        .order('issued_date', { ascending: false })
        .limit(200);

      if (violationId) {
        query = query.eq('violation_id', violationId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[nov_records] fetch error:', error.message);
        return [];
      }
      return (data ?? []) as NOVRecord[];
    },
    [orgId],
  );

  const createNOV = useCallback(
    async (fields: Partial<NOVRecord>) => {
      if (!orgId || !profile) return null;
      const { data, error } = await supabase
        .from('nov_records')
        .insert({
          ...fields,
          organization_id: orgId,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) {
        toast.error('Failed to create NOV record');
        return null;
      }

      log('nov_created', { nov_number: fields.nov_number }, {
        module: 'compliance_violations',
        tableName: 'nov_records',
        recordId: data.id,
      });

      toast.success('NOV record created');
      return data;
    },
    [orgId, profile, log],
  );

  // ── Enforcement Actions ─────────────────────────────────────────────────
  const fetchEnforcements = useCallback(
    async (violationId?: string) => {
      if (!orgId) return [];
      let query = supabase
        .from('enforcement_actions')
        .select('*')
        .eq('organization_id', orgId)
        .order('issued_date', { ascending: false })
        .limit(200);

      if (violationId) {
        query = query.eq('violation_id', violationId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[enforcement_actions] fetch error:', error.message);
        return [];
      }
      return (data ?? []) as EnforcementAction[];
    },
    [orgId],
  );

  const createEnforcement = useCallback(
    async (fields: Partial<EnforcementAction>) => {
      if (!orgId || !profile) return null;
      const { data, error } = await supabase
        .from('enforcement_actions')
        .insert({
          ...fields,
          organization_id: orgId,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) {
        toast.error('Failed to create enforcement action');
        return null;
      }

      log('enforcement_created', { type: fields.action_type }, {
        module: 'compliance_violations',
        tableName: 'enforcement_actions',
        recordId: data.id,
      });

      toast.success('Enforcement action created');
      return data;
    },
    [orgId, profile, log],
  );

  // ── Status Counts ───────────────────────────────────────────────────────
  const statusCounts = {
    open: violations.filter((v) => v.status === 'open').length,
    under_investigation: violations.filter((v) => v.status === 'under_investigation').length,
    reported: violations.filter((v) => v.status === 'reported').length,
    resolved: violations.filter((v) => v.status === 'resolved').length,
    closed: violations.filter((v) => v.status === 'closed').length,
    total_penalties: violations.reduce(
      (sum, v) => sum + (v.actual_penalty ?? v.estimated_penalty ?? 0),
      0,
    ),
  };

  return {
    violations,
    loading,
    statusCounts,
    createViolation,
    updateViolationStatus,
    fetchNOVs,
    createNOV,
    fetchEnforcements,
    createEnforcement,
    refresh: fetchViolations,
  };
}

export default useComplianceViolations;
