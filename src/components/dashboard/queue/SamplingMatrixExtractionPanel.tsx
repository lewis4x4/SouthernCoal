import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, Upload } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useSamplingMatrixImport } from '@/hooks/useSamplingMatrixImport';
import { getUploadPostProcessFollowUp } from '@/lib/uploadPostProcessLinks';
import type { SamplingMatrixExtractedPreview } from '@/lib/samplingMatrixParse';
import { VerificationBadge } from './VerificationBadge';
import type { QueueEntry } from '@/types/queue';
import type { VerificationStatus } from '@/stores/verification';

interface SamplingMatrixExtractionPanelProps {
  entry: QueueEntry;
  data: SamplingMatrixExtractedPreview;
  verificationStatus: VerificationStatus;
  onVerify: () => void;
  canVerify: boolean;
}

export function SamplingMatrixExtractionPanel({
  entry,
  data,
  verificationStatus,
  onVerify,
  canVerify,
}: SamplingMatrixExtractionPanelProps) {
  const { can } = usePermissions();
  const { importSamplingMatrix, isImporting } = useSamplingMatrixImport();
  const followUp = getUploadPostProcessFollowUp('sampling_matrix');
  const previewRows = data.rows.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-text-primary">Sampling Matrix (DRAFT parser)</h4>
        <div className="flex items-center gap-2">
          <VerificationBadge status={verificationStatus} />
          {verificationStatus !== 'verified' && (
            <button
              onClick={() => canVerify && onVerify()}
              disabled={!canVerify}
              className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-verification-verified/15 text-verification-verified border border-verification-verified/20 hover:bg-verification-verified/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={canVerify ? 'Mark extraction as reviewed' : 'Permission required to verify'}
            >
              <CheckCircle2 size={10} className="inline mr-1" />
              Mark Reviewed
            </button>
          )}
        </div>
      </div>

      <p className="text-[10px] text-amber-300/90">{data.draft_label}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryItem label="Total rows" value={data.summary.total_rows} />
        <SummaryItem label="Matched" value={data.summary.matched_rows} />
        <SummaryItem label="Partial" value={data.summary.partial_rows} />
        <SummaryItem label="Unmatched" value={data.summary.unmatched_rows} />
      </div>

      {previewRows.length > 0 && (
        <div className="rounded-lg border border-black/[0.06] overflow-hidden">
          <table className="w-full text-[10px]">
            <thead className="bg-qo-nested text-text-muted">
              <tr>
                <th className="px-2 py-1 text-left">Permit</th>
                <th className="px-2 py-1 text-left">Outfall</th>
                <th className="px-2 py-1 text-left">Parameter</th>
                <th className="px-2 py-1 text-left">Freq</th>
                <th className="px-2 py-1 text-left">Match</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr key={row.row_number} className="border-t border-black/[0.04]">
                  <td className="px-2 py-1 font-mono">{row.permit_number ?? '—'}</td>
                  <td className="px-2 py-1 font-mono">{row.outfall_number ?? '—'}</td>
                  <td className="px-2 py-1">{row.parameter_canonical ?? row.parameter_raw ?? '—'}</td>
                  <td className="px-2 py-1 font-mono">{row.frequency_code ?? '—'}</td>
                  <td className="px-2 py-1 capitalize">{row.resolution_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length > previewRows.length && (
            <p className="px-2 py-1 text-[10px] text-text-muted border-t border-black/[0.04]">
              +{data.rows.length - previewRows.length} more rows in extraction payload
            </p>
          )}
        </div>
      )}

      {data.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 space-y-1">
          {data.warnings.slice(0, 3).map((warning) => (
            <p key={warning} className="text-[10px] text-amber-200/90">
              {warning}
            </p>
          ))}
        </div>
      )}

      {entry.status === 'parsed' && data.summary.matched_rows > 0 && (
        <div className="pt-3 border-t border-black/[0.06]">
          <button
            onClick={() => can('process') && importSamplingMatrix(entry.id)}
            disabled={!can('process') || isImporting(entry.id)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-qo-accent/15 text-qo-accent border border-qo-accent/25 hover:bg-qo-accent/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title={can('process') ? 'Import matched rows to sampling_schedules' : 'Permission required to import'}
          >
            {isImporting(entry.id) ? (
              <>
                <Loader2 size={12} className="inline mr-1.5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload size={12} className="inline mr-1.5" />
                Import {data.summary.matched_rows} matched row{data.summary.matched_rows === 1 ? '' : 's'}
              </>
            )}
          </button>
          <p className="text-[10px] text-text-muted mt-1.5">
            Unmatched rows stay in extraction preview until permits, outfalls, and parameters exist in domain tables.
          </p>
        </div>
      )}

      {entry.status === 'imported' && followUp && (
        <div className="pt-3 border-t border-black/[0.06] space-y-2">
          <div className="flex items-center gap-2 text-xs text-green-300">
            <CheckCircle2 size={14} />
            <span>Schedules imported to sampling_schedules (source: matrix_upload)</span>
          </div>
          <p className="text-[10px] text-text-muted">{followUp.panelNote}</p>
          <Link
            to={followUp.href}
            className="inline-flex text-xs font-medium text-qo-accent hover:underline"
          >
            {followUp.actionLabel} →
          </Link>
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-2.5 rounded-lg bg-qo-nested border border-black/[0.05]">
      <p className="text-[10px] text-text-muted uppercase tracking-wider">{label}</p>
      <p className="text-sm font-mono font-semibold text-text-primary mt-0.5">{value}</p>
    </div>
  );
}
