import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type {
  AuditChecklist,
  AuditChecklistItem,
  AuditType,
  ChecklistStatus,
  ChecklistItemStatus,
} from '@/types/database';

// ---------------------------------------------------------------------------
// Checklist Templates
// ---------------------------------------------------------------------------

export interface ChecklistTemplate {
  audit_type: AuditType;
  label: string;
  items: { category: string; item_text: string; description?: string }[];
}

export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  {
    audit_type: 'epa_inspection',
    label: 'EPA Inspection Prep',
    items: [
      { category: 'Permits', item_text: 'Current NPDES permit available on-site', description: 'Physical or digital copy accessible' },
      { category: 'Permits', item_text: 'Permit modifications documented' },
      { category: 'DMRs', item_text: 'Last 12 months DMRs filed and on record' },
      { category: 'DMRs', item_text: 'DMR data matches monitoring records' },
      { category: 'Monitoring', item_text: 'Sampling schedules current and posted' },
      { category: 'Monitoring', item_text: 'Lab certifications valid and on file' },
      { category: 'Monitoring', item_text: 'Chain of custody forms complete' },
      { category: 'Monitoring', item_text: 'Field instrument calibration records current' },
      { category: 'Outfalls', item_text: 'Outfall locations marked and accessible' },
      { category: 'Outfalls', item_text: 'Outfall maps posted and current' },
      { category: 'Records', item_text: 'Discharge monitoring records organized (5-year retention)' },
      { category: 'Records', item_text: 'Corrective action records complete' },
      { category: 'Records', item_text: 'Exceedance notifications documented' },
      { category: 'BMPs', item_text: 'Sediment controls in place and functional' },
      { category: 'BMPs', item_text: 'SWPPP current and accessible' },
      { category: 'Training', item_text: 'Sampler training records on file' },
      { category: 'Training', item_text: 'Safety training current' },
    ],
  },
  {
    audit_type: 'consent_decree_review',
    label: 'Consent Decree Review',
    items: [
      { category: 'Obligations', item_text: 'All 75 obligations status reviewed' },
      { category: 'Obligations', item_text: 'Evidence mapped to each active obligation' },
      { category: 'Deadlines', item_text: 'Upcoming regulatory deadlines identified' },
      { category: 'Deadlines', item_text: 'Past deadline compliance verified' },
      { category: 'Violations', item_text: 'Open violations reviewed and action plans current' },
      { category: 'Violations', item_text: 'NOV response deadlines tracked' },
      { category: 'Reporting', item_text: 'Quarterly reports submitted on time' },
      { category: 'Reporting', item_text: 'Annual compliance report prepared' },
      { category: 'CAs', item_text: 'Open corrective actions on track' },
      { category: 'CAs', item_text: 'Overdue corrective actions escalated' },
      { category: 'Financial', item_text: 'Penalty payment status current' },
      { category: 'Financial', item_text: 'SEP progress documented' },
    ],
  },
  {
    audit_type: 'internal_audit',
    label: 'Internal Compliance Audit',
    items: [
      { category: 'General', item_text: 'RBAC permissions reviewed' },
      { category: 'General', item_text: 'User access audit completed' },
      { category: 'Data', item_text: 'Data quality checks passed' },
      { category: 'Data', item_text: 'Audit trail integrity verified' },
      { category: 'Operations', item_text: 'Sampling SOP adherence reviewed' },
      { category: 'Operations', item_text: 'Equipment maintenance current' },
      { category: 'Operations', item_text: 'Training compliance verified' },
      { category: 'Systems', item_text: 'Backup and recovery tested' },
      { category: 'Systems', item_text: 'Data retention policy followed' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuditChecklists() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [checklists, setChecklists] = useState<AuditChecklist[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Fetch ───────────────────────────────────────────────────────────────
  const fetchChecklists = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('audit_checklists')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[audit_checklists] fetch error:', error.message);
      toast.error('Failed to load checklists');
    } else {
      setChecklists((data ?? []) as AuditChecklist[]);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchChecklists();
  }, [fetchChecklists]);

  // ── Create from template ────────────────────────────────────────────────
  const createFromTemplate = useCallback(
    async (template: ChecklistTemplate, overrides?: { title?: string; target_date?: string; state_code?: string }) => {
      if (!orgId || !profile) return null;

      const { data: checklist, error } = await supabase
        .from('audit_checklists')
        .insert({
          organization_id: orgId,
          title: overrides?.title ?? template.label,
          audit_type: template.audit_type,
          target_date: overrides?.target_date ?? null,
          state_code: overrides?.state_code ?? null,
          status: 'active',
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) {
        toast.error('Failed to create checklist');
        return null;
      }

      // Insert items
      const items = template.items.map((item, i) => ({
        checklist_id: checklist.id,
        category: item.category,
        item_text: item.item_text,
        description: item.description ?? null,
        sort_order: i,
      }));

      await supabase.from('audit_checklist_items').insert(items);

      log('audit_checklist_created', { type: template.audit_type, items: items.length }, {
        module: 'audit',
        tableName: 'audit_checklists',
        recordId: checklist.id,
      });

      toast.success('Checklist created');
      fetchChecklists();
      return checklist as AuditChecklist;
    },
    [orgId, profile, log, fetchChecklists],
  );

  // ── Create custom ──────────────────────────────────────────────────────
  const createChecklist = useCallback(
    async (fields: Partial<AuditChecklist>) => {
      if (!orgId || !profile) return null;
      const { data, error } = await supabase
        .from('audit_checklists')
        .insert({
          ...fields,
          organization_id: orgId,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) {
        toast.error('Failed to create checklist');
        return null;
      }

      log('audit_checklist_created', { title: fields.title }, {
        module: 'audit',
        tableName: 'audit_checklists',
        recordId: data.id,
      });

      toast.success('Checklist created');
      fetchChecklists();
      return data as AuditChecklist;
    },
    [orgId, profile, log, fetchChecklists],
  );

  // ── Update checklist status ─────────────────────────────────────────────
  const updateChecklistStatus = useCallback(
    async (id: string, status: ChecklistStatus) => {
      if (!profile) return;
      const updates: Partial<AuditChecklist> = { status };
      if (status === 'complete') {
        updates.reviewed_by = profile.id;
        updates.reviewed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('audit_checklists')
        .update(updates)
        .eq('id', id);

      if (error) {
        toast.error('Failed to update status');
        return;
      }

      log('audit_checklist_status_changed', { to: status }, {
        module: 'audit',
        tableName: 'audit_checklists',
        recordId: id,
      });

      fetchChecklists();
    },
    [profile, log, fetchChecklists],
  );

  // ── Fetch items ─────────────────────────────────────────────────────────
  const fetchItems = useCallback(async (checklistId: string) => {
    const { data, error } = await supabase
      .from('audit_checklist_items')
      .select('*')
      .eq('checklist_id', checklistId)
      .order('sort_order');

    if (error) {
      console.error('[checklist_items] fetch error:', error.message);
      return [];
    }
    return (data ?? []) as AuditChecklistItem[];
  }, []);

  // ── Add item ────────────────────────────────────────────────────────────
  const addItem = useCallback(
    async (checklistId: string, fields: { category: string; item_text: string; description?: string }) => {
      const maxOrder = await supabase
        .from('audit_checklist_items')
        .select('sort_order')
        .eq('checklist_id', checklistId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { error } = await supabase
        .from('audit_checklist_items')
        .insert({
          checklist_id: checklistId,
          category: fields.category,
          item_text: fields.item_text,
          description: fields.description ?? null,
          sort_order: ((maxOrder.data as Record<string, number> | null)?.sort_order ?? -1) + 1,
        });

      if (error) {
        toast.error('Failed to add item');
        return;
      }

      toast.success('Item added');
      fetchChecklists();
    },
    [fetchChecklists],
  );

  // ── Update item status ──────────────────────────────────────────────────
  const updateItemStatus = useCallback(
    async (itemId: string, status: ChecklistItemStatus) => {
      if (!profile) return;
      const updates: Partial<AuditChecklistItem> = { status };
      if (status === 'complete') {
        updates.completed_by = profile.id;
        updates.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('audit_checklist_items')
        .update(updates)
        .eq('id', itemId);

      if (error) {
        toast.error('Failed to update item');
        return;
      }

      log('audit_checklist_item_updated', { item_id: itemId, status }, {
        module: 'audit',
        tableName: 'audit_checklist_items',
        recordId: itemId,
      });

      fetchChecklists();
    },
    [profile, log, fetchChecklists],
  );

  // ── Update item evidence ────────────────────────────────────────────────
  const updateItemEvidence = useCallback(
    async (itemId: string, evidence: { evidence_notes?: string; evidence_file_path?: string }) => {
      const { error } = await supabase
        .from('audit_checklist_items')
        .update(evidence)
        .eq('id', itemId);

      if (error) {
        toast.error('Failed to update evidence');
      }
    },
    [],
  );

  // ── Delete item ─────────────────────────────────────────────────────────
  const deleteItem = useCallback(
    async (itemId: string) => {
      const { error } = await supabase
        .from('audit_checklist_items')
        .delete()
        .eq('id', itemId);

      if (error) {
        toast.error('Failed to delete item');
        return;
      }

      fetchChecklists();
    },
    [fetchChecklists],
  );

  return {
    checklists,
    loading,
    createFromTemplate,
    createChecklist,
    updateChecklistStatus,
    fetchItems,
    addItem,
    updateItemStatus,
    updateItemEvidence,
    deleteItem,
    refresh: fetchChecklists,
  };
}

export default useAuditChecklists;
