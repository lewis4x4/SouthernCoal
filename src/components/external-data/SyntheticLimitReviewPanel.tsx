import { Download, FlaskConical, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useSyntheticPermitLimitsExport } from '@/hooks/useSyntheticPermitLimitsExport';

interface Props {
  count: number;
}

/**
 * Surfaces ECHO-backfilled permit limits labeled SYNTHETIC_UAT_SLICE1 for PDF verification.
 */
export function SyntheticLimitReviewPanel({ count }: Props) {
  const { exportCsv, loading } = useSyntheticPermitLimitsExport();

  if (count === 0) return null;

  async function handleExport() {
    const result = await exportCsv();
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Exported ${result.count.toLocaleString()} synthetic limits to CSV`);
  }

  return (
    <SpotlightCard className="p-4 border border-purple-500/20 bg-purple-500/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <FlaskConical className="w-4 h-4 text-purple-300 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-text-primary">
              {count.toLocaleString()} synthetic permit limits need verification
            </h3>
            <p className="text-xs text-text-secondary max-w-2xl">
              Backfilled from ECHO <span className="font-mono">limit_value</span> rows (
              <span className="font-mono">SYNTHETIC_UAT_SLICE1</span>). Compare against permit PDFs
              on Upload Dashboard before treating as authoritative for exceedance or DMR logic.
            </p>
            <p className="text-[10px] text-text-muted">
              CLI: <span className="font-mono">npm run qa:slice1-export-synthetic-limits</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={loading}
          className="flex items-center gap-1.5 shrink-0 rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Export CSV
        </button>
      </div>
    </SpotlightCard>
  );
}
