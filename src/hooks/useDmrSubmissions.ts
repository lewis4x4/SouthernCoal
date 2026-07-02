import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import { mapDmrLineItemRow, mapDmrLineItemUpdatesToDb, mapDmrSubmissionRow, type DmrSubmissionWithPermit } from '@/lib/dmrSchema';
import type {
  DmrSubmission,
  DmrSubmissionType,
  DmrSubmissionStatus,
  DmrLineItem,
  DmrLineItemWithRelations,
} from '@/types/database';

export type { DmrSubmissionWithPermit };

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
  conversion_warnings?: number;
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

    const baseSelect = `
        *,
        permit:npdes_permits!inner(organization_id, permit_number, metadata, site:sites(name))
      `;

    let { data, error } = await supabase
      .from('dmr_submissions')
      .select(baseSelect)
      .eq('permit.organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      ({ data, error } = await supabase
        .from('dmr_submissions')
        .select(baseSelect)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(200));
    }

    if (error) {
      console.error('[dmr] fetch failed:', error.message);
      toast.error('Failed to load DMR submissions');
      return;
    }

    setSubmissions(
      (data ?? []).map((row) =>
        mapDmrSubmissionRow(row as Record<string, unknown>),
      ),
    );
  }, [orgId]);

  const fetchSubmissionById = useCallback(
    async (submissionId: string): Promise<DmrSubmissionWithPermit | null> => {
      const { data, error } = await supabase
        .from('dmr_submissions')
        .select(`
          *,
          permit:npdes_permits(organization_id, permit_number, metadata, site:sites(name))
        `)
        .eq('id', submissionId)
        .maybeSingle();

      if (error) {
        console.error('[dmr] submission fetch failed:', error.message);
        return null;
      }
      if (!data) return null;
      return mapDmrSubmissionRow(data as Record<string, unknown>);
    },
    [],
  );

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
    const select = `
        *,
        outfall:outfalls(outfall_number, permit_id),
        parameter:parameters(name, short_name, storet_code)
      `;

    let { data, error } = await supabase
      .from('dmr_line_items')
      .select(select)
      .eq('submission_id', submissionId)
      .order('outfall_id', { ascending: true });

    if (error?.message?.includes('submission_id')) {
      ({ data, error } = await supabase
        .from('dmr_line_items')
        .select(select)
        .eq('dmr_submission_id', submissionId)
        .order('outfall_id', { ascending: true }));
    }

    if (error) {
      console.error('[dmr] line items fetch failed:', error.message);
      return [];
    }

    return (data ?? []).map((row) => mapDmrLineItemRow(row as Record<string, unknown>));
  }, []);

  // -------------------------------------------------------------------------
  // Update line item (measured value, NODI code, comments)
  // -------------------------------------------------------------------------
  const updateLineItem = useCallback(async (
    lineItemId: string,
    updates: Partial<Pick<DmrLineItem, 'measured_value' | 'measured_unit' | 'nodi_code' | 'qualifier' | 'comments'>>,
    cmsSchema = true,
  ): Promise<{ error: string | null }> => {
    const dbUpdates = mapDmrLineItemUpdatesToDb(updates, cmsSchema);
    const { error } = await supabase
      .from('dmr_line_items')
      .update(dbUpdates)
      .eq('id', lineItemId);

    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const createLineItem = useCallback(async (
    submissionId: string,
    payload: { outfall_id: string; parameter_id: string; measured_value?: number | null; nodi_code?: string | null },
    cmsSchema = true,
  ): Promise<{ error: string | null; id?: string }> => {
    const insertPayload: Record<string, unknown> = cmsSchema
      ? {
          dmr_submission_id: submissionId,
          outfall_id: payload.outfall_id,
          parameter_id: payload.parameter_id,
          concentration_max: payload.measured_value ?? null,
          nodi_code: payload.nodi_code ?? null,
          calculation_warnings: [],
        }
      : {
          submission_id: submissionId,
          outfall_id: payload.outfall_id,
          parameter_id: payload.parameter_id,
          measured_value: payload.measured_value ?? null,
          nodi_code: payload.nodi_code ?? null,
          calculation_warnings: [],
        };

    const { data, error } = await supabase
      .from('dmr_line_items')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) return { error: error.message };
    return { error: null, id: data?.id as string };
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
    const { data: massUpdated, error: massError } = await supabase.rpc(
      'apply_dmr_mass_loading_for_submission',
      { p_submission_id: submissionId },
    );
    if (result.populated && result.populated > 0) {
      toast.success(`Populated ${result.populated} of ${result.line_count} line items`);
      if (!massError && typeof massUpdated === 'number' && massUpdated > 0) {
        toast.success(`Calculated mass loading for ${massUpdated} quantity-type line(s)`);
      }
      if (result.conversion_warnings && result.conversion_warnings > 0) {
        toast.warning(
          `${result.conversion_warnings} line item(s) have missing unit conversions — review before submit`,
        );
      }
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
    fetchSubmissionById,
    fetchLineItems,
    updateLineItem,
    createLineItem,
    autoPopulate,
    validateSubmission,
    refetch: fetchSubmissions,
  };
}
