import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { parseCutoverMatrixFile } from '@/lib/cutoverMatrix';
import type {
  ArchiveManifestRow,
  CutoverBatch,
  CutoverMatrixRow,
  CutoverMatrixUpload,
  ParsedCutoverMatrixRowInput,
} from '@/types/cutover';

export function useArchiveCutover() {
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [batches, setBatches] = useState<CutoverBatch[]>([]);
  const [uploads, setUploads] = useState<CutoverMatrixUpload[]>([]);
  const [rows, setRows] = useState<CutoverMatrixRow[]>([]);
  const [manifest, setManifest] = useState<ArchiveManifestRow[]>([]);
  const [batchSummary, setBatchSummary] = useState<Record<string, unknown> | null>(null);
  const [restorePreview, setRestorePreview] = useState<Record<string, unknown> | null>(null);
  const [archivePreviewRows, setArchivePreviewRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const selectedDraftBatch = useMemo(
    () => batches.find((batch) => batch.status === 'draft' || batch.status === 'ready') ?? null,
    [batches],
  );

  const fetchBatches = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('cutover_batches')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load cutover batches');
      return;
    }

    setBatches((data ?? []) as CutoverBatch[]);
  }, [orgId]);

  const fetchBatchDetail = useCallback(async (batchId: string | null) => {
    if (!orgId || !batchId) {
      setUploads([]);
      setRows([]);
      setManifest([]);
      setBatchSummary(null);
      setRestorePreview(null);
      setArchivePreviewRows([]);
      return;
    }

    const [uploadsRes, rowsRes, manifestRes, summaryRes] = await Promise.all([
      supabase
        .from('cutover_matrix_uploads')
        .select('*')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: false }),
      supabase
        .from('cutover_matrix_rows')
        .select('*')
        .eq('batch_id', batchId)
        .order('row_number', { ascending: true })
        .limit(500),
      supabase
        .from('archive_manifest')
        .select('*')
        .eq('batch_id', batchId)
        .order('table_name', { ascending: true }),
      supabase.rpc('get_archive_batch_summary', { p_batch_id: batchId }),
    ]);

    if (!uploadsRes.error) setUploads((uploadsRes.data ?? []) as CutoverMatrixUpload[]);
    if (!rowsRes.error) setRows((rowsRes.data ?? []) as CutoverMatrixRow[]);
    if (!manifestRes.error) setManifest((manifestRes.data ?? []) as ArchiveManifestRow[]);
    if (!summaryRes.error) setBatchSummary((summaryRes.data ?? null) as Record<string, unknown> | null);
  }, [orgId]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchBatches();
      setLoading(false);
    };
    void load();
  }, [fetchBatches]);

  const createBatch = useCallback(async (input: { label: string; effectiveAt: string; notes?: string }) => {
    if (!orgId || !profile) return null;
    setWorking(true);
    try {
      const { data, error } = await supabase
        .from('cutover_batches')
        .insert({
          organization_id: orgId,
          label: input.label,
          effective_at: input.effectiveAt,
          notes: input.notes ?? null,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) {
        toast.error(`Failed to create cutover batch: ${error.message}`);
        return null;
      }

      log('roadmap_status_change', { action: 'cutover_batch_created', batch_id: data.id }, {
        module: 'cutover_batches',
        tableName: 'cutover_batches',
        recordId: data.id,
      });

      await fetchBatches();
      await fetchBatchDetail(data.id);
      toast.success('Cutover batch created');
      return data as CutoverBatch;
    } finally {
      setWorking(false);
    }
  }, [fetchBatchDetail, fetchBatches, log, orgId, profile]);

  const uploadMatrix = useCallback(async (batchId: string, file: File) => {
    if (!orgId || !profile) return;
    setWorking(true);
    try {
      const parsedRows = await parseCutoverMatrixFile(file);

      const { data: upload, error: uploadError } = await supabase
        .from('cutover_matrix_uploads')
        .insert({
          batch_id: batchId,
          organization_id: orgId,
          file_name: file.name,
          file_size_bytes: file.size,
          file_format: file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx',
          uploaded_by: profile.id,
          parsed_row_count: parsedRows.length,
        })
        .select()
        .single();

      if (uploadError || !upload) {
        toast.error(`Failed to register matrix upload: ${uploadError?.message ?? 'Unknown error'}`);
        return;
      }

      const payload = parsedRows.map((row: ParsedCutoverMatrixRowInput) => ({
        ...row,
        batch_id: batchId,
        upload_id: upload.id,
        organization_id: orgId,
      }));

      const { error: rowError } = await supabase.from('cutover_matrix_rows').insert(payload);
      if (rowError) {
        toast.error(`Failed to store matrix rows: ${rowError.message}`);
        return;
      }

      await supabase.rpc('preview_cutover_batch', { p_batch_id: batchId });
      await fetchBatches();
      await fetchBatchDetail(batchId);
      toast.success(`Uploaded ${parsedRows.length} matrix rows`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse cutover matrix';
      toast.error(message);
    } finally {
      setWorking(false);
    }
  }, [fetchBatchDetail, fetchBatches, orgId, profile]);

  const previewBatch = useCallback(async (batchId: string) => {
    setWorking(true);
    try {
      const { data, error } = await supabase.rpc('preview_cutover_batch', { p_batch_id: batchId });
      if (error) {
        toast.error(`Failed to preview cutover batch: ${error.message}`);
        return null;
      }
      await fetchBatches();
      await fetchBatchDetail(batchId);
      toast.success('Cutover preview refreshed');
      return (data ?? null) as Record<string, unknown> | null;
    } finally {
      setWorking(false);
    }
  }, [fetchBatchDetail, fetchBatches]);

  const executeBatch = useCallback(async (batchId: string) => {
    setWorking(true);
    try {
      const { data, error } = await supabase.rpc('execute_cutover_batch', { p_batch_id: batchId });
      if (error) {
        toast.error(`Failed to execute cutover: ${error.message}`);
        return null;
      }
      await fetchBatches();
      await fetchBatchDetail(batchId);
      toast.success('Cutover executed');
      return (data ?? null) as Record<string, unknown> | null;
    } finally {
      setWorking(false);
    }
  }, [fetchBatchDetail, fetchBatches]);

  const previewRestore = useCallback(async (batchId: string) => {
    setWorking(true);
    try {
      const { data, error } = await supabase.rpc('restore_archive_batch', {
        p_batch_id: batchId,
        p_mode: 'archive_only_preview',
      });
      if (error) {
        toast.error(`Failed to preview restore: ${error.message}`);
        return null;
      }
      setRestorePreview((data ?? null) as Record<string, unknown> | null);
      toast.success('Restore preview ready');
      return (data ?? null) as Record<string, unknown> | null;
    } finally {
      setWorking(false);
    }
  }, []);

  const fetchArchiveTablePreview = useCallback(async (batchId: string, tableName: string) => {
    const { data, error } = await supabase.rpc('get_archive_table_preview', {
      p_batch_id: batchId,
      p_table_name: tableName,
      p_limit: 25,
    });
    if (error) {
      toast.error(`Failed to preview archived table: ${error.message}`);
      return;
    }
    setArchivePreviewRows(((data as { rows?: Record<string, unknown>[] } | null)?.rows ?? []) as Record<string, unknown>[]);
  }, []);

  const downloadStarterMatrix = useCallback(async () => {
    if (!orgId) return;
    setWorking(true);
    try {
      const [sitesRes, permitsRes, outfallsRes] = await Promise.all([
        supabase
          .from('sites')
          .select('id, name, state_code')
          .eq('organization_id', orgId)
          .order('name', { ascending: true }),
        supabase
          .from('npdes_permits')
          .select('id, site_id, permit_number')
          .eq('organization_id', orgId)
          .order('permit_number', { ascending: true }),
        supabase
          .from('outfalls')
          .select('id, permit_id, outfall_number')
          .order('outfall_number', { ascending: true })
          .limit(5000),
      ]);

      if (sitesRes.error || permitsRes.error || outfallsRes.error) {
        toast.error('Failed to generate starter matrix');
        return;
      }

      const siteById = new Map((sitesRes.data ?? []).map((site) => [site.id, site]));
      const outfallsByPermitId = new Map<string, Array<{ id: string; outfall_number: string }>>();

      (outfallsRes.data ?? []).forEach((outfall) => {
        const list = outfallsByPermitId.get(outfall.permit_id) ?? [];
        list.push({ id: outfall.id, outfall_number: outfall.outfall_number });
        outfallsByPermitId.set(outfall.permit_id, list);
      });

      const header = [
        'state_code',
        'site_name',
        'facility_name',
        'permit_number',
        'outfall_number',
        'external_npdes_id',
        'mine_id',
        'disposition',
        'notes',
      ];

      const rows: string[][] = [header];

      (permitsRes.data ?? []).forEach((permit) => {
        const site = siteById.get(permit.site_id);
        const outfalls = outfallsByPermitId.get(permit.id) ?? [];

        if (outfalls.length === 0) {
          rows.push([
            site?.state_code ?? '',
            site?.name ?? '',
            site?.name ?? '',
            permit.permit_number ?? '',
            '',
            permit.permit_number ?? '',
            '',
            'live',
            '',
          ]);
          return;
        }

        outfalls.forEach((outfall) => {
          rows.push([
            site?.state_code ?? '',
            site?.name ?? '',
            site?.name ?? '',
            permit.permit_number ?? '',
            outfall.outfall_number ?? '',
            permit.permit_number ?? '',
            '',
            'live',
            '',
          ]);
        });
      });

      if (rows.length === 1) {
        (sitesRes.data ?? []).forEach((site) => {
          rows.push([
            site.state_code ?? '',
            site.name ?? '',
            site.name ?? '',
            '',
            '',
            '',
            '',
            'live',
            '',
          ]);
        });
      }

      const csv = rows
        .map((row) => row.map((cell) => `"${String(cell ?? '').split('"').join('""')}"`).join(','))
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cutover_starter_matrix_${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);

      toast.success('Starter matrix downloaded');
    } finally {
      setWorking(false);
    }
  }, [orgId]);

  return {
    batches,
    uploads,
    rows,
    manifest,
    batchSummary,
    restorePreview,
    archivePreviewRows,
    selectedDraftBatch,
    loading,
    working,
    fetchBatches,
    fetchBatchDetail,
    createBatch,
    uploadMatrix,
    previewBatch,
    executeBatch,
    previewRestore,
    fetchArchiveTablePreview,
    downloadStarterMatrix,
  };
}
