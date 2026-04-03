import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';

export interface ReadinessRequirement {
  id: string;
  organization_id: string;
  requirement_type: string;
  name: string;
  description: string | null;
  is_blocking: boolean;
  is_active: boolean;
  applies_to_roles: string[];
}

export interface ReadinessCheck {
  id: string;
  route_batch_id: string;
  requirement_id: string;
  checked_by: string;
  passed: boolean;
  failure_reason: string | null;
  checked_at: string;
}

export interface ReadinessGateResult {
  passed: boolean;
  requirements: ReadinessRequirement[];
  checks: ReadinessCheck[];
  failingBlocking: ReadinessRequirement[];
  failingNonBlocking: ReadinessRequirement[];
}

export function useReadinessGate() {
  const { user } = useAuth();
  const { log } = useAuditLog();
  const [loading, setLoading] = useState(false);

  const evaluateGate = useCallback(
    async (batchId: string, organizationId: string): Promise<ReadinessGateResult | null> => {
      setLoading(true);

      // Fetch active requirements for the org
      const { data: requirements, error: reqError } = await supabase
        .from('readiness_requirements')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (reqError) {
        console.error('[readiness] Failed to fetch requirements:', reqError.message);
        setLoading(false);
        return null;
      }

      const reqs = (requirements ?? []) as ReadinessRequirement[];

      // Fetch existing checks for this batch
      const { data: checks, error: checkError } = await supabase
        .from('readiness_checks')
        .select('*')
        .eq('route_batch_id', batchId);

      if (checkError) {
        console.error('[readiness] Failed to fetch checks:', checkError.message);
        setLoading(false);
        return null;
      }

      const existingChecks = (checks ?? []) as ReadinessCheck[];

      // Determine which requirements are failing
      const failingBlocking: ReadinessRequirement[] = [];
      const failingNonBlocking: ReadinessRequirement[] = [];

      for (const req of reqs) {
        const check = existingChecks.find((c) => c.requirement_id === req.id);
        if (!check || !check.passed) {
          if (req.is_blocking) {
            failingBlocking.push(req);
          } else {
            failingNonBlocking.push(req);
          }
        }
      }

      setLoading(false);

      return {
        passed: failingBlocking.length === 0,
        requirements: reqs,
        checks: existingChecks,
        failingBlocking,
        failingNonBlocking,
      };
    },
    [],
  );

  const submitCheck = useCallback(
    async (batchId: string, requirementId: string, passed: boolean, failureReason?: string) => {
      if (!user?.id) return { error: 'Not authenticated' };

      const { error } = await supabase.from('readiness_checks').upsert(
        {
          route_batch_id: batchId,
          requirement_id: requirementId,
          checked_by: user.id,
          passed,
          failure_reason: failureReason ?? null,
          checked_at: new Date().toISOString(),
        },
        { onConflict: 'route_batch_id,requirement_id' },
      );

      if (error) {
        toast.error('Failed to save readiness check');
        return { error: error.message };
      }

      log('readiness_check_submitted', {
        batch_id: batchId,
        requirement_id: requirementId,
        passed,
      }, {
        module: 'field_ops',
        tableName: 'readiness_checks',
      });

      return { error: null };
    },
    [user?.id, log],
  );

  const runGateCheck = useCallback(
    async (batchId: string) => {
      const { data, error } = await supabase.rpc('check_readiness_gate', {
        p_batch_id: batchId,
      });

      if (error) {
        toast.error('Readiness gate check failed');
        return null;
      }

      return data as boolean;
    },
    [],
  );

  const overrideGate = useCallback(
    async (batchId: string, reason: string) => {
      const { error } = await supabase.rpc('override_readiness_gate', {
        p_batch_id: batchId,
        p_reason: reason,
      });

      if (error) {
        toast.error('Override failed');
        return { error: error.message };
      }

      log('readiness_gate_override', {
        batch_id: batchId,
        reason,
      }, {
        module: 'field_ops',
        tableName: 'sampling_route_batches',
        recordId: batchId,
      });

      toast.success('Readiness gate overridden');
      return { error: null };
    },
    [log],
  );

  return {
    loading,
    evaluateGate,
    submitCheck,
    runGateCheck,
    overrideGate,
  };
}
