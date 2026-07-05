import { useCallback, useRef, useState } from 'react';
import { Upload, Loader2, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildNpdesMappingImportPreview,
  parseNpdesMappingCsv,
  type NpdesMappingImportPreview,
} from '@/lib/npdesMappingImport';

interface NpdesMappingImportPanelProps {
  saving: boolean;
  onImport: (candidates: NpdesMappingImportPreview['importable']) => Promise<{ error: string | null; imported: number }>;
  loadRegistryPermitNumbers: () => Promise<Set<string>>;
}

export function NpdesMappingImportPanel({
  saving,
  onImport,
  loadRegistryPermitNumbers,
}: NpdesMappingImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<NpdesMappingImportPreview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true);
      setFileName(file.name);
      try {
        const text = await file.text();
        const rows = parseNpdesMappingCsv(text);
        const registry = await loadRegistryPermitNumbers();
        setPreview(buildNpdesMappingImportPreview(rows, registry));
      } catch {
        toast.error('Failed to read CSV file');
        setPreview(null);
      } finally {
        setParsing(false);
      }
    },
    [loadRegistryPermitNumbers],
  );

  async function handleImport() {
    if (!preview || preview.importable.length === 0) return;
    const { error, imported } = await onImport(preview.importable);
    if (error) {
      toast.error(error);
    } else {
      toast.success(`Imported ${imported} federal NPDES mapping${imported === 1 ? '' : 's'}`);
      setPreview(null);
      setFileName(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-qo-nested overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06]">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={14} className="text-qo-accent" />
          <h3 className="text-sm font-semibold text-text-primary">Bulk NPDES crosswalk import</h3>
        </div>
        <span className="text-[10px] text-text-muted">CONFIRMED + IDENTITY only</span>
      </div>

      <div className="px-4 py-3 space-y-3">
        <p className="text-xs text-text-muted">
          Import{' '}
          <span className="font-mono text-text-secondary">SCC_Federal_NPDES_Mapping_IMPORT.csv</span>{' '}
          (columns: permit_number, npdes_id, state_code, confidence; optional confirmation_basis,
          confirmation_reference). PROXIMITY / UNKNOWN / CANDIDATE rows are skipped. VA rows require a valid
          confirmation basis before import.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <button
            type="button"
            disabled={parsing || saving}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-qo-accent/30 bg-qo-accent/10 px-3 py-1.5 text-xs font-medium text-qo-accent hover:bg-qo-accent/20 disabled:opacity-40 transition-colors"
          >
            {parsing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            Choose CSV
          </button>
          {fileName && <span className="text-xs font-mono text-text-secondary truncate max-w-[200px]">{fileName}</span>}
        </div>

        {preview && (
          <div className="rounded-lg border border-black/[0.06] bg-white/60 px-3 py-3 space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
              <div>
                <span className="text-text-muted">CSV rows</span>
                <p className="font-mono font-medium text-text-primary">{preview.totalRows}</p>
              </div>
              <div>
                <span className="text-text-muted">Ready to import</span>
                <p className="font-mono font-medium text-qo-sage-text">{preview.importable.length}</p>
              </div>
              <div>
                <span className="text-text-muted">Skipped confidence</span>
                <p className="font-mono font-medium text-qo-ochre-text">{preview.skippedConfidence.length}</p>
              </div>
              <div>
                <span className="text-text-muted">Not in registry</span>
                <p className="font-mono font-medium text-qo-risk">{preview.unmatchedPermits.length}</p>
              </div>
              <div>
                <span className="text-text-muted">Basis needed</span>
                <p className="font-mono font-medium text-qo-risk">{preview.skippedConfirmation.length}</p>
              </div>
            </div>

            {(preview.skippedInvalid.length > 0 || preview.skippedMissing.length > 0 || preview.skippedConfirmation.length > 0) && (
              <p className="flex items-center gap-1.5 text-[11px] text-qo-ochre-text">
                <AlertTriangle size={12} />
                {preview.skippedInvalid.length} invalid NPDES format · {preview.skippedMissing.length} missing fields ·{' '}
                {preview.skippedConfirmation.length} missing/invalid confirmation basis
              </p>
            )}

            {preview.importable.length > 0 && (
              <div className="max-h-32 overflow-y-auto border-t border-black/[0.04] pt-2 space-y-1">
                {preview.importable.slice(0, 8).map((row) => (
                  <div key={row.permit_number} className="flex gap-2 text-[11px] font-mono">
                    <span className="text-text-secondary w-24">{row.state_code}</span>
                    <span className="text-text-primary">{row.permit_number}</span>
                    <span className="text-text-muted">&rarr;</span>
                    <span className="text-qo-accent">{row.npdes_id}</span>
                    {row.confirmation_basis && (
                      <span className="text-qo-ochre-text">{row.confirmation_basis}</span>
                    )}
                  </div>
                ))}
                {preview.importable.length > 8 && (
                  <p className="text-[10px] text-text-muted">+ {preview.importable.length - 8} more</p>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={saving || preview.importable.length === 0}
              onClick={() => void handleImport()}
              className="w-full rounded-lg border border-qo-accent/30 bg-qo-accent/10 py-2 text-xs font-medium text-qo-accent hover:bg-qo-accent/20 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Importing…' : `Import ${preview.importable.length} mapping${preview.importable.length === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
