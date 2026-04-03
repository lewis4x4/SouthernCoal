import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type {
  HumanOverride,
  OverrideEntityType,
  LegalHold,
  LegalHoldEntityType,
  LegalHoldCategory,
} from '@/types/database';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHumanOverrides() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [overrides, setOverrides] = useState<HumanOverride[]>([]);
  const [legalHolds, setLegalHolds] = useState<LegalHold[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Fetch Overrides ─────────────────────────────────────────────────────
  const fetchOverrides = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('human_overrides')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[human_overrides] fetch error:', error.message);
    } else {
      setOverrides((data ?? []) as HumanOverride[]);
    }
    setLoading(false);
  }, [orgId]);

  // ── Fetch Legal Holds ───────────────────────────────────────────────────
  const fetchLegalHolds = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('legal_holds')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[legal_holds] fetch error:', error.message);
    } else {
      setLegalHolds((data ?? []) as LegalHold[]);
    }
  }, [orgId]);

  useEffect(() => {
    fetchOverrides();
    fetchLegalHolds();
  }, [fetchOverrides, fetchLegalHolds]);

  // ── Create Override (immutable) ─────────────────────────────────────────
  const createOverride = useCallback(
    async (fields: {
      entity_type: OverrideEntityType;
      entity_id: string;
      field_name: string;
      original_value: string | null;
      override_value: string;
      reason: string;
      decree_paragraphs?: string[];
    }) => {
      if (!orgId || !profile) return null;
      const { data, error } = await supabase
        .from('human_overrides')
        .insert({
          ...fields,
          organization_id: orgId,
          overridden_by: profile.id,
        })
        .select()
        .single();

      if (error) {
        toast.error('Failed to create override');
        return null;
      }

      log('human_override_created', {
        entity_type: fields.entity_type,
        field: fields.field_name,
        from: fields.original_value,
        to: fields.override_value,
      }, {
        module: 'human_overrides',
        tableName: 'human_overrides',
        recordId: data.id,
      });

      toast.success('Override recorded');
      fetchOverrides();
      return data as HumanOverride;
    },
    [orgId, profile, log, fetchOverrides],
  );

  // ── Approve Override ────────────────────────────────────────────────────
  const approveOverride = useCallback(
    async (id: string) => {
      if (!profile) return;
      const { error } = await supabase
        .from('human_overrides')
        .update({
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {
        toast.error('Failed to approve override');
        return;
      }

      log('human_override_approved', { override_id: id }, {
        module: 'human_overrides',
        tableName: 'human_overrides',
        recordId: id,
      });

      toast.success('Override approved');
      fetchOverrides();
    },
    [profile, log, fetchOverrides],
  );

  // ── Place Legal Hold ────────────────────────────────────────────────────
  const placeLegalHold = useCallback(
    async (fields: {
      entity_type: LegalHoldEntityType;
      entity_id: string;
      hold_reason: string;
      hold_category?: LegalHoldCategory;
      decree_paragraphs?: string[];
      notes?: string;
    }) => {
      if (!orgId || !profile) return null;
      const { data, error } = await supabase
        .from('legal_holds')
        .insert({
          ...fields,
          organization_id: orgId,
          placed_by: profile.id,
          hold_category: fields.hold_category ?? 'litigation',
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          toast.error('An active legal hold already exists on this record');
        } else {
          toast.error('Failed to place legal hold');
        }
        return null;
      }

      log('legal_hold_placed', {
        entity_type: fields.entity_type,
        entity_id: fields.entity_id,
        reason: fields.hold_reason,
      }, {
        module: 'legal_holds',
        tableName: 'legal_holds',
        recordId: data.id,
      });

      toast.success('Legal hold placed');
      fetchLegalHolds();
      return data as LegalHold;
    },
    [orgId, profile, log, fetchLegalHolds],
  );

  // ── Release Legal Hold ──────────────────────────────────────────────────
  const releaseLegalHold = useCallback(
    async (id: string, releaseReason: string) => {
      if (!profile) return;
      const { error } = await supabase
        .from('legal_holds')
        .update({
          is_active: false,
          released_by: profile.id,
          released_at: new Date().toISOString(),
          release_reason: releaseReason,
        })
        .eq('id', id);

      if (error) {
        toast.error('Failed to release legal hold');
        return;
      }

      log('legal_hold_released', { hold_id: id, reason: releaseReason }, {
        module: 'legal_holds',
        tableName: 'legal_holds',
        recordId: id,
      });

      toast.success('Legal hold released');
      fetchLegalHolds();
    },
    [profile, log, fetchLegalHolds],
  );

  // ── Check hold on entity ────────────────────────────────────────────────
  const hasActiveHold = useCallback(
    (entityType: LegalHoldEntityType, entityId: string) => {
      return legalHolds.some(
        (h) => h.entity_type === entityType && h.entity_id === entityId && h.is_active,
      );
    },
    [legalHolds],
  );

  // ── Get overrides for entity ────────────────────────────────────────────
  const getOverridesForEntity = useCallback(
    (entityType: OverrideEntityType, entityId: string) => {
      return overrides.filter(
        (o) => o.entity_type === entityType && o.entity_id === entityId,
      );
    },
    [overrides],
  );

  return {
    overrides,
    legalHolds,
    activeLegalHolds: legalHolds.filter((h) => h.is_active),
    loading,
    createOverride,
    approveOverride,
    placeLegalHold,
    releaseLegalHold,
    hasActiveHold,
    getOverridesForEntity,
    refresh: () => {
      fetchOverrides();
      fetchLegalHolds();
    },
  };
}

export default useHumanOverrides;
