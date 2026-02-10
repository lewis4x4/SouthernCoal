import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type { DataCorrection } from '@/types/corrections';

export function useDataCorrections() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const [corrections, setCorrections] = useState<DataCorrection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCorrections = useCallback(async () => {
    const { data, error } = await supabase
      .from('data_corrections')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[corrections] Failed to fetch:', error.message);
      setLoading(false);
      return;
    }

    setCorrections((data ?? []) as DataCorrection[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCorrections();
  }, [fetchCorrections]);

  const requestCorrection = useCallback(async (params: {
    entityType: DataCorrection['entity_type'];
    entityId: string;
    fieldName: string;
    originalValue: unknown;
    proposedValue: unknown;
    justification: string;
    evidencePath?: string;
  }) => {
    if (!user || !profile) return { error: 'Not authenticated' };

    const { error } = await supabase.from('data_corrections').insert({
      organization_id: profile.organization_id,
      entity_type: params.entityType,
      entity_id: params.entityId,
      field_name: params.fieldName,
      original_value: params.originalValue,
      proposed_value: params.proposedValue,
      justification: params.justification,
      supporting_evidence_path: params.evidencePath ?? null,
      status: 'pending_review',
      requested_by: user.id,
    });

    if (error) {
      toast.error('Failed to submit correction request');
      return { error: error.message };
    }

    log('correction_requested', {
      entity_type: params.entityType,
      entity_id: params.entityId,
      field_name: params.fieldName,
    }, {
      module: 'corrections',
      tableName: 'data_corrections',
    });

    toast.success('Correction request submitted');
    fetchCorrections();
    return { error: null };
  }, [user, profile, log, fetchCorrections]);

  const reviewCorrection = useCallback(async (
    correctionId: string,
    action: 'approved' | 'rejected',
    comment?: string,
  ) => {
    if (!user) return { error: 'Not authenticated' };

    const { error } = await supabase
      .from('data_corrections')
      .update({
        status: action,
        reviewed_by: user.id,
        review_comment: comment ?? null,
        reviewed_at: new Date().toISOString(),
        ...(action === 'approved' ? { applied_at: new Date().toISOString() } : {}),
      })
      .eq('id', correctionId);

    if (error) {
      if (error.message.includes('policy')) {
        toast.error('You cannot review your own correction request');
      } else {
        toast.error('Failed to submit review');
      }
      return { error: error.message };
    }

    log(action === 'approved' ? 'correction_approved' : 'correction_rejected', {
      correction_id: correctionId,
      comment,
    }, {
      module: 'corrections',
      tableName: 'data_corrections',
      recordId: correctionId,
    });

    toast.success(action === 'approved' ? 'Correction approved and applied' : 'Correction rejected');
    fetchCorrections();
    return { error: null };
  }, [user, log, fetchCorrections]);

  return { corrections, loading, requestCorrection, reviewCorrection, refresh: fetchCorrections };
}
