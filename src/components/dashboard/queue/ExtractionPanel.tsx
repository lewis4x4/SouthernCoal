import { useEffect } from 'react';
import { useVerificationStore } from '@/stores/verification';
import { usePermissions } from '@/hooks/usePermissions';
import { VerificationBadge } from './VerificationBadge';
import { CheckCircle2, Flag } from 'lucide-react';
import type { QueueEntry } from '@/types/queue';

interface ExtractionPanelProps {
  entry: QueueEntry;
}

interface ExtractedData {
  permit_number?: string;
  state?: string;
  outfall_count?: number;
  limit_count?: number;
  limits?: Array<{
    parameter?: string;
    outfall?: string;
    value?: string;
    unit?: string;
    frequency?: string;
  }>;
}

/**
 * Extraction detail panel — shows AI-extracted permit data
 * with verification badges and human review actions.
 */
export function ExtractionPanel({ entry }: ExtractionPanelProps) {
  const { can } = usePermissions();
  const verificationStatus = useVerificationStore((s) => s.getStatus(entry.id));
  const setStatus = useVerificationStore((s) => s.setStatus);
  const markOpened = useVerificationStore((s) => s.markOpened);

  // Auto-transition unreviewed → in_review when panel opens
  useEffect(() => {
    markOpened(entry.id);
  }, [entry.id, markOpened]);

  const data = entry.extracted_data as ExtractedData | null;
  if (!data) return null;

  const limits = data.limits ?? [];

  return (
    <div className="space-y-4">
      {/* Header with verification badge */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-text-primary">
          Extraction Details
        </h4>
        <div className="flex items-center gap-2">
          <VerificationBadge status={verificationStatus} />
          {can('verify') && verificationStatus !== 'verified' && (
            <button
              onClick={() => setStatus(entry.id, 'verified')}
              className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-verification-verified/15 text-verification-verified border border-verification-verified/20 hover:bg-verification-verified/25 transition-all"
            >
              <CheckCircle2 size={10} className="inline mr-1" />
              Mark Verified
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryItem label="Permit #" value={data.permit_number ?? '—'} />
        <SummaryItem label="State" value={data.state ?? '—'} />
        <SummaryItem label="Outfalls" value={data.outfall_count ?? 0} />
        <SummaryItem label="Limits" value={data.limit_count ?? limits.length} />
      </div>

      {/* Limits table */}
      {limits.length > 0 && (
        <div className="mt-3">
          <h5 className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-2">
            Extracted Limits
          </h5>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-text-muted">
                  <th className="text-left py-1.5 pr-3 font-medium">Parameter</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Outfall</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Value</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Unit</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Frequency</th>
                  {can('verify') && (
                    <th className="text-right py-1.5 font-medium">Action</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {limits.map((limit, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-white/[0.03] text-text-secondary"
                  >
                    <td className="py-1.5 pr-3">{limit.parameter ?? '—'}</td>
                    <td className="py-1.5 pr-3 font-mono">{limit.outfall ?? '—'}</td>
                    <td className="py-1.5 pr-3 font-mono">{limit.value ?? '—'}</td>
                    <td className="py-1.5 pr-3">{limit.unit ?? '—'}</td>
                    <td className="py-1.5 pr-3">{limit.frequency ?? '—'}</td>
                    {can('verify') && (
                      <td className="py-1.5 text-right">
                        <button
                          onClick={() => setStatus(entry.id, 'disputed')}
                          className="p-1 rounded text-text-muted hover:text-verification-disputed transition-colors"
                          title="Flag issue with this row"
                        >
                          <Flag size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <p className="text-[10px] text-text-muted uppercase tracking-wider">{label}</p>
      <p className="text-sm font-mono font-semibold text-text-primary mt-0.5">
        {value}
      </p>
    </div>
  );
}
