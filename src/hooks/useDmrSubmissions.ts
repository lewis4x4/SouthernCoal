import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type {
  DmrSubmission,
  DmrSubmissionType,
  DmrSubmissionStatus,
  DmrLineItem,
  DmrLineItemWithRelations,
} from '@/types/database';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------
export interface DmrSubmissionWithPermit extends DmrSubmission {
  permit_number?: string;
  site_name?: string;
}

export interface DmrValidationResult {
  valid: boolean;
  errors: Array<{ type: string; message: string; count?: number }>;
  warnings: Array<{ type: string; message: string; count?: number }>;
  total_items: number;
  populated: number;
  missing: number;
  exceedances: number;
}

export interface DmrCalculationResult {
  status: string;
  line_count: number;
  populated?: number;
  missing?: number;
  exceedances?: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useDmrSubmissions() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const [submissions, setSubmissions] = useState<DmrSubmissionWithPermit[]>([]);
  const [loading, setLoading] = useState(true);

  const orgId = profile?.organization_id ?? null;

  // -------------------------------------------------------------------------
  // Fetch all submissions
  // -------------------------------------------------------------------------
  const fetchSubmissions = useCallback(async () => {
    if (!orgId) return;

    const { data, error } = await supabase
      .from('dmr_submissions')
      .select(`
        *,
        permit:npdes_permits(permit_number, site:sites(name))
      `)
      .eq('organization_id', orgId)
      .order('monitoring_period_end', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[dmr] fetch failed:', error.message);
      toast.error('Failed to load DMR submissions');
      return;
    }

    const mapped: DmrSubmissionWithPermit[] = (data ?? []).map((row: Record<string, unknown>) => {
      const permit = row.permit as Record<string, unknown> | null;
      const site = permit?.site as Record<string, unknown> | null;
      return {
        ...row,
        permit_number: (permit?.permit_number as string) ?? undefined,
        site_name: (site?.name as string) ?? undefined,
      } as DmrSubmissionWithPermit;
    });

    setSubmissions(mapped);
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      fetchSubmissions().then(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [orgId, fetchSubmissions]);

  // Realtime
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`dmr:${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dmr_submissions',
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          fetchSubmissions();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchSubmissions]);

  // -------------------------------------------------------------------------
  // Create submission
  // -------------------------------------------------------------------------
  const createSubmission = useCallback(async (params: {
    permitId: string;
    periodStart: string;
    periodEnd: string;
    submissionType: DmrSubmissionType;
  }): Promise<string | null> => {
    if (!orgId) return null;

    const { data, error } = await supabase
      .from('dmr_submissions')
      .insert({
        organization_id: orgId,
        permit_id: params.permitId,
        monitoring_period_start: params.periodStart,
        monitoring_period_end: params.periodEnd,
        submission_type: params.submissionType,
        status: 'draft',
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        toast.error('A DMR submission already exists for this permit and period');
      } else {
        toast.error(`Failed to create submission: ${error.message}`);
      }
      return null;
    }

    log('report_generated', {
      type: 'dmr_submission_created',
      permit_id: params.permitId,
      period: `${params.periodStart} to ${params.periodEnd}`,
    }, {
      module: 'dmr',
      tableName: 'dmr_submissions',
      recordId: data.id,
    });

    toast.success('DMR submission created');
    fetchSubmissions();
    return data.id;
  }, [orgId, log, fetchSubmissions]);

  // -------------------------------------------------------------------------
  // Update submission
  // -------------------------------------------------------------------------
  const updateSubmission = useCallback(async (
    submissionId: string,
    updates: Partial<DmrSubmission>,
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from('dmr_submissions')
      .update(updates)
      .eq('id', submissionId);

    if (error) return { error: error.message };
    fetchSubmissions();
    return { error: null };
  }, [fetchSubmissions]);

  // -------------------------------------------------------------------------
  // Submit (change status to pending_submission)
  // -------------------------------------------------------------------------
  const submitDmr = useCallback(async (
    submissionId: string,
    confirmationNumber?: string,
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from('dmr_submissions')
      .update({
        status: 'pending_submission' as DmrSubmissionStatus,
        submitted_by: profile?.id ?? null,
        submitted_at: new Date().toISOString(),
        submission_confirmation: confirmationNumber ?? null,
      })
      .eq('id', submissionId);

    if (error) return { error: error.message };

    log('report_generated', {
      type: 'dmr_submitted',
      submission_id: submissionId,
    }, {
      module: 'dmr',
      tableName: 'dmr_submissions',
      recordId: submissionId,
    });

    toast.success('DMR submitted');
    fetchSubmissions();
    return { error: null };
  }, [profile?.id, log, fetchSubmissions]);

  // -------------------------------------------------------------------------
  // Mark as submitted (with confirmation number from state system)
  // -------------------------------------------------------------------------
  const markSubmitted = useCallback(async (
    submissionId: string,
    confirmationNumber: string,
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from('dmr_submissions')
      .update({
        status: 'submitted' as DmrSubmissionStatus,
        submission_confirmation: confirmationNumber,
      })
      .eq('id', submissionId);

    if (error) return { error: error.message };
    toast.success('DMR marked as submitted');
    fetchSubmissions();
    return { error: null };
  }, [fetchSubmissions]);

  // -------------------------------------------------------------------------
  // Fetch line items for a submission
  // -------------------------------------------------------------------------
  const fetchLineItems = useCallback(async (
    submissionId: string,
  ): Promise<DmrLineItemWithRelations[]> => {
    const { data, error } = await supabase
      .from('dmr_line_items')
      .select(`
        *,
        outfall:outfalls(outfall_id, npdes_permit_id),
        parameter:parameters(name, short_name, storet_code)
      `)
      .eq('submission_id', submissionId)
      .order('outfall_id', { ascending: true });

    if (error) {
      console.error('[dmr] line items fetch failed:', error.message);
      return [];
    }

    return (data ?? []).map((row: Record<string, unknown>) => {
      const outfall = row.outfall as Record<string, unknown> | null;
      return {
        ...row,
        outfall: outfall ? {
          outfall_id: outfall.outfall_id as string,
          permit_id: outfall.npdes_permit_id as string,
        } : null,
      } as DmrLineItemWithRelations;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Update line item (measured value, NODI code, comments)
  // -------------------------------------------------------------------------
  const updateLineItem = useCallback(async (
    lineItemId: string,
    updates: Partial<Pick<DmrLineItem, 'measured_value' | 'measured_unit' | 'nodi_code' | 'qualifier' | 'comments'>>,
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from('dmr_line_items')
      .update(updates)
      .eq('id', lineItemId);

    if (error) return { error: error.message };
    return { error: null };
  }, []);

  // -------------------------------------------------------------------------
  // Auto-populate from lab data (RPC)
  // -------------------------------------------------------------------------
  const autoPopulate = useCallback(async (
    submissionId: string,
  ): Promise<DmrCalculationResult | null> => {
    const { data, error } = await supabase.rpc('calculate_dmr_values', {
      p_submission_id: submissionId,
    });

    if (error) {
      toast.error(`Auto-populate failed: ${error.message}`);
      return null;
    }

    const result = data as DmrCalculationResult;
    if (result.populated && result.populated > 0) {
      toast.success(`Populated ${result.populated} of ${result.line_count} line items`);
    } else if (result.status === 'no_discharge') {
      toast.info('No Discharge selected — no calculations needed');
    } else {
      toast.warning('No lab data found for this monitoring period');
    }

    log('report_generated', {
      type: 'dmr_auto_populated',
      submission_id: submissionId,
      result,
    }, {
      module: 'dmr',
      tableName: 'dmr_submissions',
      recordId: submissionId,
    });

    return result;
  }, [log]);

  // -------------------------------------------------------------------------
  // Validate submission (RPC)
  // -------------------------------------------------------------------------
  const validateSubmission = useCallback(async (
    submissionId: string,
  ): Promise<DmrValidationResult | null> => {
    const { data, error } = await supabase.rpc('validate_dmr_submission', {
      p_submission_id: submissionId,
    });

    if (error) {
      toast.error(`Validation failed: ${error.message}`);
      return null;
    }

    return data as DmrValidationResult;
  }, []);

  // -------------------------------------------------------------------------
  // Status counts
  // -------------------------------------------------------------------------
  const statusCounts = {
    draft: submissions.filter((s) => s.status === 'draft').length,
    pending: submissions.filter((s) => s.status === 'pending_submission').length,
    submitted: submissions.filter((s) => s.status === 'submitted').length,
    accepted: submissions.filter((s) => s.status === 'accepted').length,
    rejected: submissions.filter((s) => s.status === 'rejected').length,
  };

  return {
    submissions,
    loading,
    statusCounts,
    createSubmission,
    updateSubmission,
    submitDmr,
    markSubmitted,
    fetchLineItems,
    updateLineItem,
    autoPopulate,
    validateSubmission,
    refetch: fetchSubmissions,
  };
}
