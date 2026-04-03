import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type { RCATemplate, RCAFinding, RCAFormData } from '@/types/rca';

/**
 * Hook for RCA templates and findings.
 * Templates are org-scoped and seeded by migration.
 * Findings are linked to a specific corrective action.
 */
export function useRCATemplates() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const [templates, setTemplates] = useState<RCATemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const orgId = profile?.organization_id ?? null;

  // -------------------------------------------------------------------------
  // Fetch all active templates for org
  // -------------------------------------------------------------------------
  const fetchTemplates = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('rca_templates')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('category', { ascending: true });

    if (error) {
      console.error('[rca] templates fetch failed:', error.message);
      return;
    }
    setTemplates((data ?? []) as RCATemplate[]);
  }, [orgId]);

  useEffect(() => {
    if (orgId) {
      fetchTemplates().then(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [orgId, fetchTemplates]);

  // -------------------------------------------------------------------------
  // Fetch findings for a specific CA
  // -------------------------------------------------------------------------
  const fetchFindings = useCallback(async (caId: string): Promise<RCAFinding[]> => {
    const { data, error } = await supabase
      .from('rca_findings')
      .select('*')
      .eq('corrective_action_id', caId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[rca] findings fetch failed:', error.message);
      return [];
    }
    return (data ?? []) as RCAFinding[];
  }, []);

  // -------------------------------------------------------------------------
  // Create a finding
  // -------------------------------------------------------------------------
  const createFinding = useCallback(async (
    caId: string,
    formData: RCAFormData,
  ): Promise<RCAFinding | null> => {
    if (!orgId || !profile?.id) return null;

    const { data, error } = await supabase
      .from('rca_findings')
      .insert({
        corrective_action_id: caId,
        organization_id: orgId,
        template_id: formData.template_id ?? null,
        category: formData.category,
        why_1: formData.why_1 || null,
        why_2: formData.why_2 || null,
        why_3: formData.why_3 || null,
        why_4: formData.why_4 || null,
        why_5: formData.why_5 || null,
        contributing_factors: formData.contributing_factors,
        root_cause_summary: formData.root_cause_summary,
        recurrence_risk: formData.recurrence_risk,
        preventive_recommendation: formData.preventive_recommendation || null,
        decree_paragraphs: formData.decree_paragraphs,
        analyzed_by: profile.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[rca] create finding failed:', error.message);
      toast.error('Failed to save RCA finding');
      return null;
    }

    log('corrective_action_step_data_updated', {
      ca_id: caId,
      step: 'root_cause_analysis',
      rca_finding_id: data.id,
      category: formData.category,
    }, {
      module: 'corrective_actions',
      tableName: 'rca_findings',
      recordId: data.id,
      newValues: { category: formData.category, root_cause_summary: formData.root_cause_summary },
    });

    toast.success('Root cause analysis saved');
    return data as RCAFinding;
  }, [orgId, profile?.id, log]);

  // -------------------------------------------------------------------------
  // Update a finding
  // -------------------------------------------------------------------------
  const updateFinding = useCallback(async (
    findingId: string,
    updates: Partial<RCAFormData>,
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from('rca_findings')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', findingId);

    if (error) {
      toast.error('Failed to update RCA finding');
      return { error: error.message };
    }

    toast.success('RCA finding updated');
    return { error: null };
  }, []);

  // -------------------------------------------------------------------------
  // Delete a finding
  // -------------------------------------------------------------------------
  const deleteFinding = useCallback(async (findingId: string): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from('rca_findings')
      .delete()
      .eq('id', findingId);

    if (error) {
      toast.error('Failed to delete RCA finding');
      return { error: error.message };
    }

    toast.success('RCA finding deleted');
    return { error: null };
  }, []);

  return {
    templates,
    loading,
    fetchFindings,
    createFinding,
    updateFinding,
    deleteFinding,
    refetch: fetchTemplates,
  };
}
