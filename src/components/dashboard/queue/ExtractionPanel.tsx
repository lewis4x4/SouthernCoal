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
  document_type?: string;
  permit_number?: string;
  state?: string;
  effective_date?: string;
  expiration_date?: string;
  outfall_count?: number;
  limit_count?: number;
  limits?: Array<{
    parameter?: string;
    outfall?: string;
    value?: string;
    unit?: string;
    frequency?: string;
  }>;
  mod_number?: string;
  description?: string;
  extension_months?: number;
  new_expiration_date?: string;
  released_outfalls?: string[];
  test_types?: string[];
  from_entity?: string;
  to_entity?: string;
  monitoring_period?: string;
  summary?: string;
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  original_permit: 'Original Permit',
  modification: 'Modification',
  extension: 'Extension',
  extension_letter: 'Extension Letter',
  renewal: 'Renewal',
  draft_permit: 'Draft Permit',
  transfer: 'Transfer',
  closure: 'Closure',
  inactivation: 'Inactivation',
  tsmp_permit: 'TSMP Permit',
  monitoring_release: 'Monitoring Release',
  wet_suspension: 'WET Suspension',
  selenium_compliance: 'Selenium Compliance',
  administrative_notice: 'Administrative Notice',
};

const TYPES_WITH_LIMITS = ['original_permit', 'renewal', 'draft_permit', 'tsmp_permit', 'modification'];

/**
 * Extraction detail panel — shows AI-extracted permit data
 * with verification badges and human review actions.
 * Renders type-specific content based on document_type.
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

  const docType = data.document_type ?? 'original_permit';
  const docLabel = DOCUMENT_TYPE_LABELS[docType] ?? docType;
  const hasLimits = TYPES_WITH_LIMITS.includes(docType);
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

      {/* Summary stats — always show type, permit #, state */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryItem label="Doc Type" value={docLabel} />
        <SummaryItem label="Permit #" value={data.permit_number ?? '—'} />
        <SummaryItem label="State" value={data.state ?? '—'} />
        {hasLimits ? (
          <SummaryItem label="Limits" value={data.limit_count ?? limits.length} />
        ) : (
          <SummaryItem label="Effective" value={data.effective_date ?? '—'} />
        )}
      </div>

      {/* Additional stats row for permits with limits */}
      {hasLimits && (data.outfall_count || data.effective_date || data.expiration_date) && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {data.outfall_count != null && (
            <SummaryItem label="Outfalls" value={data.outfall_count} />
          )}
          {data.effective_date && (
            <SummaryItem label="Effective" value={data.effective_date} />
          )}
          {data.expiration_date && (
            <SummaryItem label="Expires" value={data.expiration_date} />
          )}
        </div>
      )}

      {/* Type-specific details */}
      <TypeSpecificDetails data={data} docType={docType} />

      {/* Summary text (all types) */}
      {data.summary && (
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Summary</p>
          <p className="text-xs text-text-secondary">{data.summary}</p>
        </div>
      )}

      {/* Limits table — only for document types that have limits */}
      {hasLimits && limits.length > 0 && (
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

function TypeSpecificDetails({ data, docType }: { data: ExtractedData; docType: string }) {
  switch (docType) {
    case 'modification':
      return (data.mod_number || data.description) ? (
        <div className="grid grid-cols-2 gap-3">
          {data.mod_number && <SummaryItem label="Mod #" value={data.mod_number} />}
          {data.description && (
            <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] col-span-2">
              <p className="text-[10px] text-text-muted uppercase tracking-wider">What Changed</p>
              <p className="text-xs text-text-secondary mt-0.5">{data.description}</p>
            </div>
          )}
        </div>
      ) : null;

    case 'extension':
      return (data.extension_months || data.new_expiration_date) ? (
        <div className="grid grid-cols-2 gap-3">
          {data.extension_months != null && (
            <SummaryItem label="Extension" value={`${data.extension_months} months`} />
          )}
          {data.new_expiration_date && (
            <SummaryItem label="New Expiration" value={data.new_expiration_date} />
          )}
        </div>
      ) : null;

    case 'monitoring_release':
      return data.released_outfalls?.length ? (
        <div className="grid grid-cols-1 gap-3">
          <SummaryItem label="Released Outfalls" value={data.released_outfalls.join(', ')} />
        </div>
      ) : null;

    case 'wet_suspension':
      return data.test_types?.length ? (
        <div className="grid grid-cols-1 gap-3">
          <SummaryItem label="Suspended Tests" value={data.test_types.join(', ')} />
        </div>
      ) : null;

    case 'transfer':
      return (data.from_entity || data.to_entity) ? (
        <div className="grid grid-cols-2 gap-3">
          {data.from_entity && <SummaryItem label="From" value={data.from_entity} />}
          {data.to_entity && <SummaryItem label="To" value={data.to_entity} />}
        </div>
      ) : null;

    case 'selenium_compliance':
      return data.monitoring_period ? (
        <div className="grid grid-cols-1 gap-3">
          <SummaryItem label="Monitoring Period" value={data.monitoring_period} />
        </div>
      ) : null;

    default:
      return null;
  }
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
