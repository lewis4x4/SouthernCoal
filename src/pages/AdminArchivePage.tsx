import { useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, DatabaseBackup, Search } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useArchiveCutover } from '@/hooks/useArchiveCutover';
import type { CutoverBatch } from '@/types/cutover';

function formatDateTime(value: string | null) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleString();
}

export function AdminArchivePage() {
  const {
    batches,
    manifest,
    batchSummary,
    restorePreview,
    archivePreviewRows,
    loading,
    working,
    fetchBatchDetail,
    previewRestore,
    fetchArchiveTablePreview,
  } = useArchiveCutover();

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedBatchId) {
      const firstExecuted = batches.find((batch) => batch.status === 'executed');
      if (firstExecuted) {
        setSelectedBatchId(firstExecuted.id);
      }
    }
  }, [batches, selectedBatchId]);

  useEffect(() => {
    if (!selectedBatchId) return;
    void fetchBatchDetail(selectedBatchId);
  }, [fetchBatchDetail, selectedBatchId]);

  useEffect(() => {
    if (!selectedBatchId || !selectedTable) return;
    void fetchArchiveTablePreview(selectedBatchId, selectedTable);
  }, [fetchArchiveTablePreview, selectedBatchId, selectedTable]);

  const selectedBatch: CutoverBatch | null = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Archive Mode</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Browse executed cutover batches, inspect archived table counts, preview archived rows, and rehearse restore behavior.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SpotlightCard className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <DatabaseBackup className="h-5 w-5 text-cyan-300" />
            <h2 className="text-lg font-semibold text-text-primary">Executed Batches</h2>
          </div>
          {loading ? (
            <div className="text-sm text-text-secondary">Loading archive batches…</div>
          ) : (
            <div className="space-y-2">
              {batches.filter((batch) => batch.status === 'executed').map((batch) => (
                <button
                  key={batch.id}
                  onClick={() => setSelectedBatchId(batch.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left ${
                    batch.id === selectedBatchId
                      ? 'border-cyan-500/40 bg-cyan-500/10'
                      : 'border-white/10 bg-white/[0.02]'
                  }`}
                >
                  <div className="text-sm font-medium text-text-primary">{batch.label}</div>
                  <div className="mt-1 text-xs text-text-secondary">
                    Executed {formatDateTime(batch.executed_at)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </SpotlightCard>

        <div className="space-y-6">
          <SpotlightCard className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Archive Summary</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {selectedBatch ? `${selectedBatch.label} · executed ${formatDateTime(selectedBatch.executed_at)}` : 'Select an executed batch'}
                </p>
              </div>
              {selectedBatch && (
                <button
                  onClick={() => void previewRestore(selectedBatch.id)}
                  disabled={working}
                  className="inline-flex items-center gap-2 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/15 px-3 py-2 text-sm font-medium text-fuchsia-100 disabled:opacity-50"
                >
                  <ArchiveRestore className="h-4 w-4" />
                  Restore Preview
                </button>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <SpotlightCard className="p-4">
                <div className="text-xs uppercase tracking-widest text-text-secondary">Manifest Tables</div>
                <div className="mt-2 text-2xl font-semibold text-text-primary">{manifest.length}</div>
              </SpotlightCard>
              <SpotlightCard className="p-4">
                <div className="text-xs uppercase tracking-widest text-text-secondary">Archived Rows</div>
                <div className="mt-2 text-2xl font-semibold text-text-primary">
                  {manifest.reduce((sum, row) => sum + row.archived_row_count, 0)}
                </div>
              </SpotlightCard>
              <SpotlightCard className="p-4">
                <div className="text-xs uppercase tracking-widest text-text-secondary">Live Roster Sites</div>
                <div className="mt-2 text-2xl font-semibold text-text-primary">
                  {String(((batchSummary?.roster_counts as Record<string, unknown> | undefined)?.sites ?? '0'))}
                </div>
              </SpotlightCard>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02]">
              <div className="border-b border-white/10 px-4 py-3 text-sm font-medium text-text-primary">
                Archive Manifest
              </div>
              <div className="max-h-[320px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-950/95">
                    <tr className="text-left text-text-secondary">
                      <th className="px-3 py-2">Table</th>
                      <th className="px-3 py-2">Rows</th>
                      <th className="px-3 py-2">Checksum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manifest.map((row) => (
                      <tr key={row.id} className="border-t border-white/5">
                        <td className="px-3 py-2 text-text-primary">{row.table_name}</td>
                        <td className="px-3 py-2 text-text-secondary">{row.archived_row_count}</td>
                        <td className="px-3 py-2 font-mono text-xs text-text-secondary">{row.checksum_text ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </SpotlightCard>

          <SpotlightCard className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-cyan-300" />
              <h2 className="text-lg font-semibold text-text-primary">Archive Table Preview</h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedTable ?? ''}
                onChange={(event) => setSelectedTable(event.target.value || null)}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-text-primary"
              >
                <option value="">Select archived table</option>
                {manifest.map((row) => (
                  <option key={row.table_name} value={row.table_name}>{row.table_name}</option>
                ))}
              </select>
            </div>

            <div className="max-h-[420px] overflow-auto rounded-xl border border-white/10 bg-white/[0.02] p-4">
              {archivePreviewRows.length === 0 ? (
                <div className="text-sm text-text-secondary">Select a table to preview archived rows.</div>
              ) : (
                <pre className="whitespace-pre-wrap break-all text-xs text-text-secondary">
                  {JSON.stringify(archivePreviewRows, null, 2)}
                </pre>
              )}
            </div>
          </SpotlightCard>

          {restorePreview && (
            <SpotlightCard className="p-5">
              <h2 className="text-lg font-semibold text-text-primary">Restore Preview</h2>
              <pre className="mt-3 whitespace-pre-wrap break-all text-xs text-text-secondary">
                {JSON.stringify(restorePreview, null, 2)}
              </pre>
            </SpotlightCard>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminArchivePage;
