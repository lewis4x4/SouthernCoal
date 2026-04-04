import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, DatabaseZap, FileUp, PlayCircle, RefreshCw } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useArchiveCutover } from '@/hooks/useArchiveCutover';
import type { CutoverBatch } from '@/types/cutover';

function formatDateTime(value: string | null) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleString();
}

function summaryValue(summary: Record<string, unknown> | null, path: string[]): string {
  let current: unknown = summary;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return '0';
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current == null ? '0' : String(current);
}

export function AdminCutoverPage() {
  const {
    batches,
    rows,
    uploads,
    selectedDraftBatch,
    loading,
    working,
    createBatch,
    uploadMatrix,
    previewBatch,
    executeBatch,
    fetchBatchDetail,
  } = useArchiveCutover();

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [label, setLabel] = useState('April 15 2026 Live Reset');
  const [effectiveAt, setEffectiveAt] = useState('2026-04-15T00:00');
  const [notes, setNotes] = useState('Manual baseline cutover to archive pre-live operational history.');

  useEffect(() => {
    if (!selectedBatchId && selectedDraftBatch) {
      setSelectedBatchId(selectedDraftBatch.id);
    }
  }, [selectedBatchId, selectedDraftBatch]);

  useEffect(() => {
    if (!selectedBatchId) return;
    void fetchBatchDetail(selectedBatchId);
  }, [fetchBatchDetail, selectedBatchId]);

  const selectedBatch: CutoverBatch | null = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  );
  const previewSummary = (selectedBatch?.summary_json ?? null) as Record<string, unknown> | null;

  const unresolvedRows = rows.filter((row) => row.resolution_status === 'unresolved' || row.resolution_status === 'ambiguous');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Live Reset Cutover</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Upload facility matrices, validate the post-April-15 live roster, preview impact, and execute the archive cutover.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-6">
          <SpotlightCard className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <DatabaseZap className="h-5 w-5 text-cyan-300" />
              <h2 className="text-lg font-semibold text-text-primary">Create Draft Batch</h2>
            </div>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-widest text-text-secondary">Label</span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-widest text-text-secondary">Effective At</span>
              <input
                type="datetime-local"
                value={effectiveAt}
                onChange={(event) => setEffectiveAt(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs uppercase tracking-widest text-text-secondary">Notes</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary"
              />
            </label>
            <button
              onClick={() => void createBatch({ label, effectiveAt: new Date(effectiveAt).toISOString(), notes })}
              disabled={working || !label.trim() || !effectiveAt}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-200 border border-cyan-500/30 disabled:opacity-50"
            >
              <CalendarDays className="h-4 w-4" />
              Create Draft
            </button>
          </SpotlightCard>

          <SpotlightCard className="p-5 space-y-4">
            <h2 className="text-lg font-semibold text-text-primary">Cutover Batches</h2>
            {loading ? (
              <div className="text-sm text-text-secondary">Loading batches…</div>
            ) : batches.length === 0 ? (
              <div className="text-sm text-text-secondary">No batches created yet.</div>
            ) : (
              <div className="space-y-2">
                {batches.map((batch) => (
                  <button
                    key={batch.id}
                    onClick={() => setSelectedBatchId(batch.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left ${
                      batch.id === selectedBatchId
                        ? 'border-cyan-500/40 bg-cyan-500/10'
                        : 'border-white/10 bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-text-primary">{batch.label}</span>
                      <span className="text-[10px] uppercase tracking-wider text-text-secondary">{batch.status}</span>
                    </div>
                    <div className="mt-1 text-xs text-text-secondary">
                      Effective {formatDateTime(batch.effective_at)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SpotlightCard>
        </div>

        <div className="space-y-6">
          <SpotlightCard className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Batch Workspace</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {selectedBatch ? `${selectedBatch.label} · ${selectedBatch.status}` : 'Select a batch to continue'}
                </p>
              </div>
              {selectedBatch && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-text-primary">
                    <FileUp className="h-4 w-4 text-cyan-300" />
                    Upload Matrix
                    <input
                      type="file"
                      accept=".xlsx,.csv"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file && selectedBatchId) {
                          void uploadMatrix(selectedBatchId, file);
                        }
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                  <button
                    onClick={() => selectedBatchId && void previewBatch(selectedBatchId)}
                    disabled={working || !selectedBatchId}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-text-primary disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Preview
                  </button>
                  <button
                    onClick={() => selectedBatchId && void executeBatch(selectedBatchId)}
                    disabled={working || !selectedBatchId}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-200 disabled:opacity-50"
                  >
                    <PlayCircle className="h-4 w-4" />
                    Execute Cutover
                  </button>
                </div>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <SpotlightCard className="p-4">
                <div className="text-xs uppercase tracking-widest text-text-secondary">Live Sites</div>
                <div className="mt-2 text-2xl font-semibold text-text-primary">
                  {summaryValue(previewSummary, ['live_roster_counts', 'site_count'])}
                </div>
              </SpotlightCard>
              <SpotlightCard className="p-4">
                <div className="text-xs uppercase tracking-widest text-text-secondary">Uploads</div>
                <div className="mt-2 text-2xl font-semibold text-text-primary">{uploads.length}</div>
              </SpotlightCard>
              <SpotlightCard className="p-4">
                <div className="text-xs uppercase tracking-widest text-text-secondary">Unresolved</div>
                <div className="mt-2 text-2xl font-semibold text-amber-300">
                  {summaryValue(previewSummary, ['row_counts', 'unresolved_rows'])}
                </div>
              </SpotlightCard>
              <SpotlightCard className="p-4">
                <div className="text-xs uppercase tracking-widest text-text-secondary">Ambiguous</div>
                <div className="mt-2 text-2xl font-semibold text-red-300">
                  {summaryValue(previewSummary, ['row_counts', 'ambiguous_rows'])}
                </div>
              </SpotlightCard>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="text-xs uppercase tracking-widest text-text-secondary">Archive Preview</div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {Object.entries((previewSummary?.archive_preview as Record<string, unknown> | undefined) ?? {}).map(([tableName, count]) => (
                  <div key={tableName} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
                    <div className="text-text-secondary">{tableName}</div>
                    <div className="mt-1 font-semibold text-text-primary">{String(count)}</div>
                  </div>
                ))}
              </div>
            </div>
          </SpotlightCard>

          <SpotlightCard className="p-5 space-y-4">
            <h2 className="text-lg font-semibold text-text-primary">Matrix Resolution</h2>
            {rows.length === 0 ? (
              <div className="text-sm text-text-secondary">Upload a matrix to see resolution results.</div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-text-secondary">
                  Showing the first {Math.min(rows.length, 500)} resolved rows for the selected batch.
                </div>
                <div className="max-h-[480px] overflow-auto rounded-xl border border-white/10">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-slate-950/95">
                      <tr className="text-left text-text-secondary">
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Disposition</th>
                        <th className="px-3 py-2">State</th>
                        <th className="px-3 py-2">Site</th>
                        <th className="px-3 py-2">Permit</th>
                        <th className="px-3 py-2">Outfall</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-t border-white/5">
                          <td className="px-3 py-2 text-text-primary">{row.row_number}</td>
                          <td className="px-3 py-2 text-text-secondary">{row.disposition}</td>
                          <td className="px-3 py-2 text-text-secondary">{row.state_code ?? '—'}</td>
                          <td className="px-3 py-2 text-text-secondary">{row.site_name ?? row.facility_name ?? '—'}</td>
                          <td className="px-3 py-2 text-text-secondary">{row.permit_number ?? '—'}</td>
                          <td className="px-3 py-2 text-text-secondary">{row.outfall_number ?? '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded px-2 py-1 text-[11px] ${
                              row.resolution_status === 'matched'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : row.resolution_status === 'excluded'
                                  ? 'bg-slate-500/15 text-slate-300'
                                  : row.resolution_status === 'ambiguous'
                                    ? 'bg-red-500/15 text-red-300'
                                    : 'bg-amber-500/15 text-amber-300'
                            }`}>
                              {row.resolution_status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">{row.resolution_notes ?? row.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </SpotlightCard>

          {unresolvedRows.length > 0 && (
            <SpotlightCard className="p-5">
              <h2 className="text-lg font-semibold text-amber-200">Unresolved or Ambiguous Rows</h2>
              <div className="mt-3 space-y-2 text-sm">
                {unresolvedRows.slice(0, 25).map((row) => (
                  <div key={row.id} className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-100">
                    Row {row.row_number}: {row.resolution_notes ?? 'Needs resolution'}
                  </div>
                ))}
              </div>
            </SpotlightCard>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminCutoverPage;
