import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type {
  TrainingCatalogItem,
  TrainingRequirement,
  TrainingCompletion,
  TrainingReadinessResult,
} from '@/types/training';

export function useTraining() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const [catalog, setCatalog] = useState<TrainingCatalogItem[]>([]);
  const [requirements, setRequirements] = useState<TrainingRequirement[]>([]);
  const [completions, setCompletions] = useState<TrainingCompletion[]>([]);
  const [loading, setLoading] = useState(true);

  const orgId = profile?.organization_id ?? null;

  const fetchCatalog = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('training_catalog')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('category', { ascending: true });

    if (error) {
      console.error('[training] catalog fetch failed:', error.message);
      return;
    }
    setCatalog((data ?? []) as TrainingCatalogItem[]);
  }, [orgId]);

  const fetchRequirements = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('training_requirements')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (error) {
      console.error('[training] requirements fetch failed:', error.message);
      return;
    }
    setRequirements((data ?? []) as TrainingRequirement[]);
  }, [orgId]);

  const fetchCompletions = useCallback(async (userId?: string) => {
    if (!orgId) return;
    let q = supabase
      .from('training_completions')
      .select('*')
      .eq('organization_id', orgId)
      .order('completed_at', { ascending: false })
      .limit(500);

    if (userId) {
      q = q.eq('user_id', userId);
    }

    const { data, error } = await q;
    if (error) {
      console.error('[training] completions fetch failed:', error.message);
      return;
    }
    setCompletions((data ?? []) as TrainingCompletion[]);
  }, [orgId]);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    Promise.all([fetchCatalog(), fetchRequirements(), fetchCompletions()]).then(() =>
      setLoading(false),
    );
  }, [fetchCatalog, fetchRequirements, fetchCompletions, orgId]);

  const addCatalogItem = useCallback(
    async (item: {
      name: string;
      description?: string;
      category: string;
      is_certification: boolean;
      validity_months?: number;
    }) => {
      if (!orgId) return { error: 'No org' };

      const { error } = await supabase.from('training_catalog').insert({
        organization_id: orgId,
        name: item.name,
        description: item.description ?? null,
        category: item.category,
        is_certification: item.is_certification,
        validity_months: item.validity_months ?? null,
      });

      if (error) {
        toast.error('Failed to add training item');
        return { error: error.message };
      }

      log('training_catalog_created', { name: item.name }, {
        module: 'training',
        tableName: 'training_catalog',
      });

      toast.success('Training item added');
      fetchCatalog();
      return { error: null };
    },
    [orgId, log, fetchCatalog],
  );

  const recordCompletion = useCallback(
    async (params: {
      userId: string;
      trainingId: string;
      completedAt?: string;
      certificatePath?: string;
      certificateFileName?: string;
      notes?: string;
    }) => {
      if (!orgId) return { error: 'No org' };

      // Look up validity to compute expiration
      const training = catalog.find((c) => c.id === params.trainingId);
      let expiresAt: string | null = null;
      if (training?.validity_months) {
        const d = new Date(params.completedAt ?? new Date().toISOString());
        d.setMonth(d.getMonth() + training.validity_months);
        expiresAt = d.toISOString().split('T')[0]!;
      }

      const { error } = await supabase.from('training_completions').insert({
        organization_id: orgId,
        user_id: params.userId,
        training_id: params.trainingId,
        completed_at: params.completedAt ?? new Date().toISOString().split('T')[0],
        expires_at: expiresAt,
        certificate_storage_path: params.certificatePath ?? null,
        certificate_file_name: params.certificateFileName ?? null,
        notes: params.notes ?? null,
        status: 'pending_verification',
      });

      if (error) {
        toast.error('Failed to record completion');
        return { error: error.message };
      }

      log('training_completion_recorded', {
        user_id: params.userId,
        training_id: params.trainingId,
      }, {
        module: 'training',
        tableName: 'training_completions',
      });

      toast.success('Training completion recorded');
      fetchCompletions(params.userId);
      return { error: null };
    },
    [orgId, catalog, log, fetchCompletions],
  );

  const verifyCompletion = useCallback(
    async (completionId: string) => {
      if (!user?.id) return { error: 'Not authenticated' };

      const { error } = await supabase
        .from('training_completions')
        .update({
          status: 'active',
          verified_by: user.id,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', completionId);

      if (error) {
        toast.error('Failed to verify completion');
        return { error: error.message };
      }

      toast.success('Training completion verified');
      fetchCompletions();
      return { error: null };
    },
    [user?.id, fetchCompletions],
  );

  const checkUserReadiness = useCallback(
    async (userId: string): Promise<TrainingReadinessResult[]> => {
      const { data, error } = await supabase.rpc('check_training_readiness', {
        p_user_id: userId,
      });

      if (error) {
        console.error('[training] readiness check failed:', error.message);
        return [];
      }

      return (data ?? []) as TrainingReadinessResult[];
    },
    [],
  );

  return {
    catalog,
    requirements,
    completions,
    loading,
    addCatalogItem,
    recordCompletion,
    verifyCompletion,
    checkUserReadiness,
    refresh: () => Promise.all([fetchCatalog(), fetchRequirements(), fetchCompletions()]),
  };
}
