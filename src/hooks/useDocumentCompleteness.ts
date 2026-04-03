import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type {
  DocumentCompleteness,
  DocumentCompletenessResult,
  DocumentType,
  ObligationEvidence,
  EvidenceType,
  EvidenceVerificationStatus,
  AuditReadinessScore,
} from '@/types/database';

// ---------------------------------------------------------------------------
// Document type labels
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  permit_copy: 'Permit Copy',
  dmr_current: 'Current DMRs',
  dmr_archive: 'DMR Archive',
  sampling_schedule: 'Sampling Schedule',
  outfall_map: 'Outfall Map',
  site_map: 'Site Map',
  om_manual: 'O&M Manual',
  spcc_plan: 'SPCC Plan',
  swppp: 'SWPPP',
  training_records: 'Training Records',
  inspection_logs: 'Inspection Logs',
  monitoring_data: 'Monitoring Data',
  corrective_action_log: 'CA Log',
  annual_report: 'Annual Report',
  discharge_log: 'Discharge Log',
  chain_of_custody: 'Chain of Custody',
  lab_certifications: 'Lab Certifications',
  calibration_records: 'Calibration Records',
  emergency_plan: 'Emergency Plan',
  consent_decree_copy: 'Consent Decree Copy',
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDocumentCompleteness() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [completenessResults, setCompletenessResults] = useState<DocumentCompletenessResult[]>([]);
  const [documents, setDocuments] = useState<DocumentCompleteness[]>([]);
  const [evidence, setEvidence] = useState<ObligationEvidence[]>([]);
  const [readinessScore, setReadinessScore] = useState<AuditReadinessScore | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Fetch completeness via RPC ──────────────────────────────────────────
  const fetchCompleteness = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .rpc('calculate_document_completeness', { p_org_id: orgId });

    if (error) {
      console.error('[doc_completeness] rpc error:', error.message);
    } else {
      setCompletenessResults((data ?? []) as DocumentCompletenessResult[]);
    }
  }, [orgId]);

  // ── Fetch raw documents ─────────────────────────────────────────────────
  const fetchDocuments = useCallback(async (permitId?: string) => {
    if (!orgId) return;
    let query = supabase
      .from('document_completeness')
      .select('*')
      .eq('organization_id', orgId);

    if (permitId) {
      query = query.eq('permit_id', permitId);
    }

    const { data, error } = await query.order('document_type');
    if (error) {
      console.error('[document_completeness] fetch error:', error.message);
    } else {
      setDocuments((data ?? []) as DocumentCompleteness[]);
    }
  }, [orgId]);

  // ── Fetch evidence ──────────────────────────────────────────────────────
  const fetchEvidence = useCallback(async (obligationId?: string) => {
    if (!orgId) return;
    let query = supabase
      .from('obligation_evidence')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (obligationId) {
      query = query.eq('obligation_id', obligationId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[obligation_evidence] fetch error:', error.message);
    } else {
      setEvidence((data ?? []) as ObligationEvidence[]);
    }
  }, [orgId]);

  // ── Fetch readiness score ───────────────────────────────────────────────
  const fetchReadinessScore = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .rpc('get_audit_readiness_score', { p_org_id: orgId });

    if (error) {
      console.error('[readiness_score] rpc error:', error.message);
    } else {
      setReadinessScore(data as AuditReadinessScore);
    }
  }, [orgId]);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchCompleteness(), fetchEvidence(), fetchReadinessScore()]);
      setLoading(false);
    };
    load();
  }, [fetchCompleteness, fetchEvidence, fetchReadinessScore]);

  // ── Upsert document status ──────────────────────────────────────────────
  const upsertDocument = useCallback(
    async (permitId: string, documentType: DocumentType, fields: {
      is_on_file: boolean;
      is_current: boolean;
      file_path?: string;
      last_updated?: string;
      expiry_date?: string;
      notes?: string;
    }) => {
      if (!orgId || !profile) return;

      const { error } = await supabase
        .from('document_completeness')
        .upsert({
          organization_id: orgId,
          permit_id: permitId,
          document_type: documentType,
          ...fields,
          verified_by: profile.id,
          verified_at: new Date().toISOString(),
        }, {
          onConflict: 'organization_id,permit_id,document_type',
        });

      if (error) {
        toast.error('Failed to update document status');
        return;
      }

      log('document_completeness_updated', { permit_id: permitId, type: documentType }, {
        module: 'audit',
        tableName: 'document_completeness',
      });

      fetchCompleteness();
      fetchReadinessScore();
    },
    [orgId, profile, log, fetchCompleteness, fetchReadinessScore],
  );

  // ── Add evidence ────────────────────────────────────────────────────────
  const addEvidence = useCallback(
    async (fields: {
      obligation_id: string;
      evidence_type: EvidenceType;
      title: string;
      description?: string;
      file_path?: string;
      record_table?: string;
      record_id?: string;
      effective_date?: string;
      expiry_date?: string;
    }) => {
      if (!orgId || !profile) return null;

      const { data, error } = await supabase
        .from('obligation_evidence')
        .insert({
          ...fields,
          organization_id: orgId,
          submitted_by: profile.id,
        })
        .select()
        .single();

      if (error) {
        toast.error('Failed to add evidence');
        return null;
      }

      log('obligation_evidence_added', { obligation_id: fields.obligation_id, type: fields.evidence_type }, {
        module: 'audit',
        tableName: 'obligation_evidence',
        recordId: data.id,
      });

      toast.success('Evidence added');
      fetchEvidence();
      fetchReadinessScore();
      return data as ObligationEvidence;
    },
    [orgId, profile, log, fetchEvidence, fetchReadinessScore],
  );

  // ── Update evidence verification ────────────────────────────────────────
  const updateEvidenceStatus = useCallback(
    async (id: string, status: EvidenceVerificationStatus) => {
      if (!profile) return;
      const { error } = await supabase
        .from('obligation_evidence')
        .update({
          verification_status: status,
          verified_by: profile.id,
          verified_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) {
        toast.error('Failed to update evidence status');
        return;
      }

      log('obligation_evidence_verified', { id, status }, {
        module: 'audit',
        tableName: 'obligation_evidence',
        recordId: id,
      });

      fetchEvidence();
      fetchReadinessScore();
    },
    [profile, log, fetchEvidence, fetchReadinessScore],
  );

  return {
    completenessResults,
    documents,
    evidence,
    readinessScore,
    loading,
    fetchDocuments,
    upsertDocument,
    addEvidence,
    updateEvidenceStatus,
    fetchCompleteness,
    fetchReadinessScore,
    refresh: () => {
      fetchCompleteness();
      fetchEvidence();
      fetchReadinessScore();
    },
  };
}

export default useDocumentCompleteness;
