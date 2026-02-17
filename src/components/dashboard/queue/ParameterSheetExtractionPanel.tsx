import { useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { usePermitLimitsImport } from '@/hooks/usePermitLimitsImport';
import { VerificationBadge } from './VerificationBadge';
import {
  CheckCircle2,
  Flag,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Upload,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import type { QueueEntry } from '@/types/queue';
import type { VerificationStatus } from '@/stores/verification';
import type {
  ExtractedParameterSheet,
  ExtractedPermit,
  ExtractedLimit,
} from '@/types/database';

interface ParameterSheetExtractionPanelProps {
  entry: QueueEntry;
  data: ExtractedParameterSheet;
  verificationStatus: VerificationStatus;
  onVerify: () => void;
  onDispute: () => void;
  canVerify: boolean;
}

/**
 * Extraction panel for WV parameter sheet Excel files.
 * Displays permits, outfalls, and extracted limits with verification controls.
 */
export function ParameterSheetExtractionPanel({
  entry,
  data,
  verificationStatus,
  onVerify,
  onDispute,
  canVerify,
}: ParameterSheetExtractionPanelProps) {
  const [expandedPermit, setExpandedPermit] = useState<string | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);
  const { can } = usePermissions();
  const { importPermitLimits, isImporting } = usePermitLimitsImport();

  const unmatchedCount = data.summary.unmatched_parameter_count ?? 0;
  const hasUnmatchedParams = unmatchedCount > 0;

  return (
    <div className="space-y-4">
      {/* Header with verification badge */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-text-primary flex items-center gap-2">
          <FileSpreadsheet size={14} className="text-primary" />
          Parameter Sheet Extraction
        </h4>
        <div className="flex items-center gap-2">
          <VerificationBadge status={verificationStatus} />
          {canVerify && verificationStatus !== 'verified' && (
            <button
              onClick={onVerify}
              className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-verification-verified/15 text-verification-verified border border-verification-verified/20 hover:bg-verification-verified/25 transition-all"
            >
              <CheckCircle2 size={10} className="inline mr-1" />
              Mark Verified
            </button>
          )}
        </div>
      </div>

      {/* Summary stats row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryItem label="State" value={data.state_code} />
        <SummaryItem label="Format" value={data.file_format.toUpperCase()} />
        <SummaryItem label="Permits" value={data.summary.total_permits} />
        <SummaryItem label="Outfalls" value={data.summary.total_outfalls} />
      </div>

      {/* Summary stats row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryItem label="Total Limits" value={data.summary.total_limits} />
        <SummaryItem
          label="Report Only"
          value={data.summary.report_only_limits}
        />
        <SummaryItem
          label="Not Constructed"
          value={data.summary.not_constructed_outfalls}
        />
        <SummaryItem
          label="Matched Params"
          value={`${data.summary.matched_parameters}/${data.summary.matched_parameters + unmatchedCount}`}
        />
      </div>

      {/* Unmatched parameters warning */}
      {hasUnmatchedParams && (
        <div className="p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/20">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-300">
                {unmatchedCount} Unmatched Parameter{unmatchedCount > 1 ? 's' : ''}
              </p>
              <p className="text-[10px] text-amber-200/70 mt-0.5">
                {data.summary.unmatched_parameters.slice(0, 5).join(', ')}
                {data.summary.unmatched_parameters.length > 5 &&
                  ` (+${data.summary.unmatched_parameters.length - 5} more)`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Skipped tabs notice */}
      {data.skipped_tabs.length > 0 && (
        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <p className="text-[10px] text-text-muted uppercase tracking-wider">
            Skipped Tabs ({data.skipped_tabs.length})
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            {data.skipped_tabs.join(', ')}
          </p>
        </div>
      )}

      {/* Per-permit collapsible sections */}
      <div className="space-y-2">
        <h5 className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
          Permits ({data.permits.length})
        </h5>
        {data.permits.map((permit) => (
          <PermitSection
            key={permit.permit_number}
            permit={permit}
            isExpanded={expandedPermit === permit.permit_number}
            onToggle={() =>
              setExpandedPermit(
                expandedPermit === permit.permit_number ? null : permit.permit_number,
              )
            }
            onDispute={onDispute}
            canVerify={canVerify}
          />
        ))}
      </div>

      {/* Warnings — collapsible */}
      {data.warnings.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowWarnings(!showWarnings)}
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-300 font-medium mb-1 hover:text-amber-200 transition-colors"
          >
            {showWarnings ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Warnings ({data.warnings.length})
          </button>
          {showWarnings && (
            <ul className="space-y-1 pl-3">
              {data.warnings.map((w, i) => (
                <li key={i} className="text-xs text-amber-200/70">
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Truncation notice */}
      {data.limits_truncated && (
        <p className="text-[10px] text-text-muted italic">
          Limits preview truncated. Full data is preserved in the original file.
        </p>
      )}

      {/* Approve & Import — moves parsed data to domain tables */}
      {entry.status === 'parsed' && can('process') && (
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => importPermitLimits(entry.id)}
            disabled={isImporting(entry.id)}
            aria-busy={isImporting(entry.id)}
            aria-label={
              isImporting(entry.id)
                ? 'Importing permit limits...'
                : 'Approve and import permit limits to database'
            }
            className="px-4 py-2 text-xs font-medium rounded-lg bg-green-500/15 text-green-300 border border-green-500/20 hover:bg-green-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting(entry.id) ? (
              <>
                <Loader2 size={12} className="inline mr-1.5 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload size={12} className="inline mr-1.5" />
                Approve & Import
              </>
            )}
          </button>
          <p className="text-[10px] text-text-muted mt-1.5">
            Imports {data.summary.total_limits.toLocaleString()} permit limits
            across {data.summary.total_permits} permit{data.summary.total_permits > 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* Already imported indicator */}
      {entry.status === 'imported' && (
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2 text-xs text-green-300">
            <CheckCircle2 size={14} />
            <span>Permit limits successfully imported to domain tables</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface PermitSectionProps {
  permit: ExtractedPermit;
  isExpanded: boolean;
  onToggle: () => void;
  onDispute: () => void;
  canVerify: boolean;
}

function PermitSection({
  permit,
  isExpanded,
  onToggle,
  onDispute,
  canVerify,
}: PermitSectionProps) {
  const activeOutfalls = permit.outfalls.filter((o) => o.is_active).length;
  const previewLimits = permit.limits.slice(0, 10);

  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] overflow-hidden">
      {/* Permit header — clickable to expand */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown size={14} className="text-text-muted" />
          ) : (
            <ChevronRight size={14} className="text-text-muted" />
          )}
          <div>
            <p className="text-xs font-mono font-semibold text-text-primary">
              {permit.permit_number}
            </p>
            {permit.subsidiary_name && (
              <p className="text-[10px] text-text-muted truncate max-w-[200px]">
                {permit.subsidiary_name}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-text-muted">
          <span>{activeOutfalls} outfall{activeOutfalls !== 1 ? 's' : ''}</span>
          <span>{permit.limits.length} limit{permit.limits.length !== 1 ? 's' : ''}</span>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-white/[0.04] p-3 space-y-3">
          {/* Address if available */}
          {permit.address && (
            <p className="text-[10px] text-text-muted">{permit.address}</p>
          )}

          {/* Outfall badges */}
          <div className="flex flex-wrap gap-1.5">
            {permit.outfalls.map((outfall) => (
              <span
                key={outfall.outfall_number}
                className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                  outfall.is_active
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                }`}
              >
                {outfall.outfall_number}
                {!outfall.is_active && ' (NC)'}
              </span>
            ))}
          </div>

          {/* Limits preview table */}
          {previewLimits.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-text-muted">
                    <th className="text-left py-1.5 pr-3 font-medium">Outfall</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Parameter</th>
                    <th className="text-right py-1.5 pr-3 font-medium">Min</th>
                    <th className="text-right py-1.5 pr-3 font-medium">Avg</th>
                    <th className="text-right py-1.5 pr-3 font-medium">Max</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Unit</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Freq</th>
                    {canVerify && (
                      <th className="text-right py-1.5 font-medium">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {previewLimits.map((limit, idx) => (
                    <LimitRow
                      key={`${limit.outfall_number}-${limit.parameter_raw}-${idx}`}
                      limit={limit}
                      onDispute={onDispute}
                      canVerify={canVerify}
                    />
                  ))}
                </tbody>
              </table>
              {permit.limits.length > 10 && (
                <p className="text-[10px] text-text-muted mt-2 italic">
                  + {permit.limits.length - 10} more limits not shown
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface LimitRowProps {
  limit: ExtractedLimit;
  onDispute: () => void;
  canVerify: boolean;
}

function LimitRow({ limit, onDispute, canVerify }: LimitRowProps) {
  const formatValue = (val: number | null): string => {
    if (val === null) return '—';
    return val.toString();
  };

  const parameterDisplay = limit.parameter_canonical ?? limit.parameter_raw;
  const isUnmatched = !limit.parameter_id;

  return (
    <tr className="border-b border-white/[0.03] text-text-secondary">
      <td className="py-1.5 pr-3 font-mono">{limit.outfall_number}</td>
      <td className="py-1.5 pr-3">
        <span className={isUnmatched ? 'text-amber-400' : ''}>
          {parameterDisplay}
        </span>
        {isUnmatched && (
          <span className="ml-1 text-[9px] text-amber-400/70">(unmatched)</span>
        )}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono">
        {limit.is_report_only ? (
          <span className="text-text-muted italic">RO</span>
        ) : (
          formatValue(limit.limit_min)
        )}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono">
        {limit.is_report_only ? (
          <span className="text-text-muted italic">RO</span>
        ) : (
          formatValue(limit.limit_avg)
        )}
      </td>
      <td className="py-1.5 pr-3 text-right font-mono">
        {limit.is_report_only ? (
          <span className="text-text-muted italic">RO</span>
        ) : (
          formatValue(limit.limit_max)
        )}
      </td>
      <td className="py-1.5 pr-3">{limit.unit || '—'}</td>
      <td className="py-1.5 pr-3">{limit.frequency || '—'}</td>
      {canVerify && (
        <td className="py-1.5 text-right">
          <button
            onClick={onDispute}
            className="p-1 rounded text-text-muted hover:text-verification-disputed transition-colors"
            title="Flag issue with this limit"
          >
            <Flag size={12} />
          </button>
        </td>
      )}
    </tr>
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
