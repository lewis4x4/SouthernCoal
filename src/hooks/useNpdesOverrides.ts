import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { useUserProfile } from '@/hooks/useUserProfile';
import { validateFederalNpdesId, validateConfirmationBasis, type NpdesConfirmationBasis } from '@/lib/npdesMapping';
import type { NpdesMappingImportCandidate } from '@/lib/npdesMappingImport';

const UI_BULK_IMPORT_SOURCE = 'ui_bulk_import_npdes_mapping';

export interface NpdesOverride {
  id: string;
  organization_id: string;
  state_code: string;
  source_permit_id: string;
  npdes_id: string;
  notes: string | null;
  confirmation_basis: string | null;
  confirmation_reference: string | null;
  confirmed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface UnmatchedPermit {
  source_permit_id: string;
  state_code: string;
}

/** Active registry row with no federal_npdes_id_override in metadata (post-import cleanup queue). */
export interface SaveOverrideOptions {
  notes?: string;
  confirmationBasis?: NpdesConfirmationBasis;
  confirmationReference?: string;
  requireConfirmationBasis?: boolean;
}

export interface RegistryFederalMappingGap {
  permit_number: string;
  state_code: string;
  issuing_agency: string | null;
}

export function useNpdesOverrides() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const [overrides, setOverrides] = useState<NpdesOverride[]>([]);
  const [unmatchedPermits, setUnmatchedPermits] = useState<UnmatchedPermit[]>([]);
  const [registryMappingGaps, setRegistryMappingGaps] = useState<RegistryFederalMappingGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const orgId = profile?.organization_id;

  const syncPermitFederalMetadata = useCallback(
    async (
      sourcePermitId: string,
      npdesId: string | null,
      confirmation?: {
        basis?: NpdesConfirmationBasis | null;
        reference?: string | null;
      },
    ) => {
      if (!orgId) return { error: 'No organization' };
      const permitKey = sourcePermitId.trim().toUpperCase();

      const { data: permits, error: lookupError } = await supabase
        .from('npdes_permits')
        .select('id, permit_number, metadata')
        .eq('organization_id', orgId);

      if (lookupError) return { error: lookupError.message };

      const permit = (permits || []).find(
        (row) => row.permit_number.trim().toUpperCase() === permitKey,
      );
      if (!permit) {
        return { error: null, skipped: true as const };
      }

      const existingMeta =
        permit.metadata && typeof permit.metadata === 'object'
          ? (permit.metadata as Record<string, unknown>)
          : {};

      const nextMetadata = { ...existingMeta };
      if (npdesId) {
        nextMetadata.federal_npdes_id_override = npdesId;
        nextMetadata.federal_npdes_id_override_updated_at = new Date().toISOString();
        nextMetadata.federal_npdes_id_override_source = 'manual_echo_coverage';
        if (confirmation?.basis) {
          nextMetadata.federal_npdes_confirmation_basis = confirmation.basis;
          nextMetadata.federal_npdes_confirmation_reference =
            confirmation.reference?.trim() || null;
          nextMetadata.federal_npdes_confirmed_at = new Date().toISOString();
        }
      } else {
        delete nextMetadata.federal_npdes_id_override;
        delete nextMetadata.federal_npdes_id_override_updated_at;
        delete nextMetadata.federal_npdes_id_override_source;
        delete nextMetadata.federal_npdes_mapping_confidence;
        delete nextMetadata.federal_npdes_confirmation_basis;
        delete nextMetadata.federal_npdes_confirmation_reference;
        delete nextMetadata.federal_npdes_confirmed_at;
      }

      const { error: updateError } = await supabase
        .from('npdes_permits')
        .update({ metadata: nextMetadata })
        .eq('id', permit.id);

      if (updateError) return { error: updateError.message };
      return { error: null, skipped: false as const };
    },
    [orgId],
  );

  const fetchOverrides = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);

    // Fetch existing overrides
    const { data: overrideData } = await supabase
      .from('npdes_id_overrides')
      .select('*')
      .eq('organization_id', orgId)
      .order('state_code')
      .order('source_permit_id');

    setOverrides((overrideData || []) as NpdesOverride[]);

    // Fetch permits that failed ECHO sync (no matching facility row)
    // These are permits in file_processing_queue that have no external_echo_facilities match
    const { data: queuePermits } = await supabase
      .from('file_processing_queue')
      .select('extracted_data, state_code')
      .in('status', ['parsed', 'embedded', 'imported'])
      .eq('file_category', 'npdes_permit')
      .not('extracted_data->permit_number', 'is', null);

    const { data: echoFacilities } = await supabase
      .from('external_echo_facilities')
      .select('npdes_id');

    const echoSet = new Set((echoFacilities || []).map((f) => (f.npdes_id as string).toUpperCase()));
    const overrideSourceSet = new Set((overrideData || []).map((o) => (o as NpdesOverride).source_permit_id.toUpperCase()));

    // Find permits that are neither in ECHO nor already have an override
    const unmatched: UnmatchedPermit[] = [];
    const seen = new Set<string>();
    for (const row of queuePermits || []) {
      const permitNum = (row.extracted_data as Record<string, unknown>)?.permit_number as string | undefined;
      if (!permitNum) continue;

      const cleaned = permitNum.trim().toUpperCase();
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);

      // Skip if already in ECHO or already has an override
      if (echoSet.has(cleaned) || overrideSourceSet.has(cleaned)) continue;

      unmatched.push({
        source_permit_id: cleaned,
        state_code: row.state_code || 'Unknown',
      });
    }

    setUnmatchedPermits(unmatched.sort((a, b) => a.state_code.localeCompare(b.state_code) || a.source_permit_id.localeCompare(b.source_permit_id)));

    const { data: registryPermits, error: registryError } = await supabase
      .from('npdes_permits')
      .select('permit_number, issuing_agency, metadata, states(code)')
      .eq('organization_id', orgId)
      .order('permit_number');

    if (registryError) {
      console.warn('[useNpdesOverrides] registry gap query failed:', registryError.message);
      setRegistryMappingGaps([]);
    } else {
      const gaps: RegistryFederalMappingGap[] = [];
      for (const row of registryPermits || []) {
        const meta = row.metadata as Record<string, unknown> | null;
        const override = (meta?.federal_npdes_id_override as string | undefined)?.trim();
        if (override) continue;
        const stateJoin = row.states as { code?: string } | { code?: string }[] | null;
        const stateCode = Array.isArray(stateJoin) ? stateJoin[0]?.code : stateJoin?.code;
        gaps.push({
          permit_number: row.permit_number,
          state_code: stateCode ?? '—',
          issuing_agency: row.issuing_agency ?? null,
        });
      }
      setRegistryMappingGaps(
        gaps.sort(
          (a, b) =>
            a.state_code.localeCompare(b.state_code) || a.permit_number.localeCompare(b.permit_number),
        ),
      );
    }

    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  const saveOverride = useCallback(
    async (
      sourcePermitId: string,
      npdesId: string,
      stateCode: string,
      options?: SaveOverrideOptions,
    ) => {
      if (!orgId || !user) return { error: 'Not authenticated' };

      const validation = validateFederalNpdesId(npdesId);
      if (!validation.valid) {
        return { error: validation.message ?? 'Invalid federal NPDES ID' };
      }

      const basisValidation = validateConfirmationBasis(
        options?.confirmationBasis,
        options?.confirmationReference,
        { required: options?.requireConfirmationBasis ?? false },
      );
      if (!basisValidation.valid) {
        return { error: basisValidation.message ?? 'Invalid confirmation basis' };
      }

      setSaving(true);

      const confirmedAt =
        options?.confirmationBasis ? new Date().toISOString() : null;

      const { error } = await supabase
        .from('npdes_id_overrides')
        .upsert(
          {
            organization_id: orgId,
            state_code: stateCode,
            source_permit_id: sourcePermitId.trim().toUpperCase(),
            npdes_id: npdesId.trim().toUpperCase(),
            notes: options?.notes || null,
            confirmation_basis: options?.confirmationBasis ?? null,
            confirmation_reference: options?.confirmationReference?.trim() || null,
            confirmed_at: confirmedAt,
            created_by: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,source_permit_id' },
        );

      setSaving(false);

      if (error) return { error: error.message };

      const normalizedNpdes = npdesId.trim().toUpperCase();
      const metaResult = await syncPermitFederalMetadata(sourcePermitId, normalizedNpdes, {
        basis: options?.confirmationBasis ?? null,
        reference: options?.confirmationReference ?? null,
      });
      if (metaResult.error) {
        return {
          error: `Override saved but registry metadata update failed: ${metaResult.error}`,
        };
      }

      log(
        'npdes_federal_mapping_saved',
        {
          source_permit_id: sourcePermitId.trim().toUpperCase(),
          npdes_id: normalizedNpdes,
          state_code: stateCode,
          confirmation_basis: options?.confirmationBasis ?? null,
          confirmation_reference: options?.confirmationReference?.trim() || null,
          actor_user_id: user.id,
        },
        { module: 'external_data', tableName: 'npdes_id_overrides' },
      );

      await fetchOverrides();
      return { error: null };
    },
    [orgId, user, fetchOverrides, syncPermitFederalMetadata, log],
  );

  const deleteOverride = useCallback(
    async (id: string) => {
      const row = overrides.find((ov) => ov.id === id);
      const { error } = await supabase.from('npdes_id_overrides').delete().eq('id', id);
      if (error) return { error: error.message };

      if (row) {
        const metaResult = await syncPermitFederalMetadata(row.source_permit_id, null);
        if (metaResult.error) {
          return {
            error: `Override removed but registry metadata clear failed: ${metaResult.error}`,
          };
        }
        log(
          'npdes_federal_mapping_removed',
          { source_permit_id: row.source_permit_id, npdes_id: row.npdes_id },
          { module: 'external_data', tableName: 'npdes_id_overrides', recordId: id },
        );
      }

      await fetchOverrides();
      return { error: null };
    },
    [overrides, fetchOverrides, syncPermitFederalMetadata, log],
  );

  const bulkImportMappings = useCallback(
    async (candidates: NpdesMappingImportCandidate[]) => {
      if (!orgId || !user) return { error: 'Not authenticated', imported: 0 };
      if (candidates.length === 0) return { error: 'No rows to import', imported: 0 };

      setSaving(true);

      const overridePayloads = candidates.map((c) => ({
        organization_id: orgId,
        state_code: c.state_code,
        source_permit_id: c.permit_number,
        npdes_id: c.npdes_id,
        notes: `UI bulk import; confidence=${c.confidence}`,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }));

      const BATCH = 50;
      let overrideOk = 0;
      for (let i = 0; i < overridePayloads.length; i += BATCH) {
        const batch = overridePayloads.slice(i, i + BATCH);
        const { error } = await supabase
          .from('npdes_id_overrides')
          .upsert(batch, { onConflict: 'organization_id,source_permit_id' });
        if (error) {
          setSaving(false);
          return { error: error.message, imported: overrideOk };
        }
        overrideOk += batch.length;
      }

      let metadataOk = 0;
      const metadataErrors: string[] = [];
      for (const c of candidates) {
        const validation = validateFederalNpdesId(c.npdes_id);
        if (!validation.valid) continue;

        const metaResult = await syncPermitFederalMetadata(c.permit_number, c.npdes_id);
        if (metaResult.error) {
          metadataErrors.push(`${c.permit_number}: ${metaResult.error}`);
        } else if (!metaResult.skipped) {
          metadataOk += 1;
        }
      }

      log(
        'bulk_npdes_mapping_import',
        {
          imported_count: metadataOk,
          override_upserted: overrideOk,
          source: UI_BULK_IMPORT_SOURCE,
          metadata_errors: metadataErrors.length,
        },
        { module: 'external_data', tableName: 'npdes_id_overrides' },
      );

      setSaving(false);
      await fetchOverrides();

      if (metadataErrors.length > 0) {
        return {
          error: `${overrideOk} overrides saved; ${metadataErrors.length} registry metadata update(s) failed`,
          imported: metadataOk,
        };
      }

      return { error: null, imported: metadataOk };
    },
    [orgId, user, fetchOverrides, syncPermitFederalMetadata, log],
  );

  const fetchRegistryPermitNumbers = useCallback(async (): Promise<Set<string>> => {
    if (!orgId) return new Set();
    const { data } = await supabase
      .from('npdes_permits')
      .select('permit_number')
      .eq('organization_id', orgId);
    return new Set((data ?? []).map((r) => r.permit_number.trim().toUpperCase()));
  }, [orgId]);

  return {
    overrides,
    unmatchedPermits,
    registryMappingGaps,
    loading,
    saving,
    saveOverride,
    deleteOverride,
    refetch: fetchOverrides,
    bulkImportMappings,
    fetchRegistryPermitNumbers,
  };
}
