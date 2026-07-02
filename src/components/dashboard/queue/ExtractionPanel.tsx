import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useVerificationStore } from '@/stores/verification';
import { usePermissions } from '@/hooks/usePermissions';
import { useObligationGeneration } from '@/hooks/useObligationGeneration';
import { useLabDataImport } from '@/hooks/useLabDataImport';
import { useDmrImport } from '@/hooks/useDmrImport';
import { usePermitLimitsImport } from '@/hooks/usePermitLimitsImport';
import { VerificationBadge } from './VerificationBadge';
import { ParameterSheetExtractionPanel } from './ParameterSheetExtractionPanel';
import { SamplingMatrixExtractionPanel } from './SamplingMatrixExtractionPanel';
import type { SamplingMatrixExtractedPreview } from '@/lib/samplingMatrixParse';
import {
  getLabExtractionMeta,
  isLabExtractionDocumentType,
  normalizeLabExtractionDisplay,
  type LabDataExtractionDisplay,
} from '@/lib/labExtractionDisplay';
import { CATEGORY_BY_DB_KEY } from '@/lib/constants';
import { getUploadPostProcessFollowUp } from '@/lib/uploadPostProcessLinks';
import { CheckCircle2, Flag, ChevronDown, ChevronRight, AlertTriangle, CalendarPlus, Upload, Loader2 } from 'lucide-react';
import type { QueueEntry } from '@/types/queue';
import type { VerificationStatus } from '@/stores/verification';
import type { ExtractedParameterSheet } from '@/types/database';

interface ExtractionPanelProps {
  entry: QueueEntry;
}

interface ExtractedData {
  document_type?: string;
  archive_category?: string;
  file_name?: string;
  storage_bucket?: string;
  storage_path?: string;
  indexed_at?: string;
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

type ArchiveExtractedData = Pick<
  ExtractedData,
  'archive_category' | 'file_name' | 'state' | 'storage_bucket' | 'storage_path' | 'summary' | 'indexed_at'
>;

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
  const { generateDMRSchedule, generating } = useObligationGeneration();
  const { importPermitLimits, isImporting: isPermitImporting } = usePermitLimitsImport();
  const verificationStatus = useVerificationStore((s) => s.getStatus(entry.id));
  const setStatus = useVerificationStore((s) => s.setStatus);
  const markOpened = useVerificationStore((s) => s.markOpened);

  // Auto-transition unreviewed → in_review when panel opens
  useEffect(() => {
    markOpened(entry.id);
  }, [entry.id, markOpened]);

  const data = entry.extracted_data as ExtractedData | null;
  if (!data) return null;

  // NetDMR bundle branch — parsed CSV/ZIP exports (import to dmr_submissions is a follow-on)
  if (data.document_type === 'netdmr_bundle') {
    return (
      <NetDmrExtractionPanel
        entry={entry}
        data={data as unknown as NetDmrExtractionDisplay}
        verificationStatus={verificationStatus}
        onVerify={() => setStatus(entry.id, 'verified')}
        onDispute={() => setStatus(entry.id, 'disputed')}
        canVerify={can('verify')}
      />
    );
  }

  // Lab data branch — EDD + state-specific parsers (VA/TN/AL)
  if (isLabExtractionDocumentType(data.document_type)) {
    const normalized = normalizeLabExtractionDisplay(data as unknown as Record<string, unknown>);
    if (!normalized) return null;
    const meta = getLabExtractionMeta(data as unknown as Record<string, unknown>);
    return (
      <LabDataExtractionPanel
        entry={entry}
        data={normalized}
        meta={meta}
        verificationStatus={verificationStatus}
        onVerify={() => setStatus(entry.id, 'verified')}
        onDispute={() => setStatus(entry.id, 'disputed')}
        canVerify={can('verify')}
      />
    );
  }

  // Parameter sheet branch — WV Excel permit parameter sheets
  if (data.document_type === 'parameter_sheet') {
    return (
      <ParameterSheetExtractionPanel
        entry={entry}
        data={data as unknown as ExtractedParameterSheet}
        verificationStatus={verificationStatus}
        onVerify={() => setStatus(entry.id, 'verified')}
        onDispute={() => setStatus(entry.id, 'disputed')}
        canVerify={can('verify')}
      />
    );
  }

  // Sampling matrix — tabular Q14 stub (CSV/XLSX)
  if (data.document_type === 'sampling_matrix') {
    return (
      <SamplingMatrixExtractionPanel
        entry={entry}
        data={data as unknown as SamplingMatrixExtractedPreview}
        verificationStatus={verificationStatus}
        onVerify={() => setStatus(entry.id, 'verified')}
        canVerify={can('verify')}
      />
    );
  }

  // Compliance archive — indexed for search (field inspections, outreach docs, etc.)
  if (data.document_type === 'compliance_archive') {
    return (
      <ArchiveExtractionPanel
        entry={entry}
        data={data as ArchiveExtractedData}
        verificationStatus={verificationStatus}
        onVerify={() => setStatus(entry.id, 'verified')}
        canVerify={can('verify')}
      />
    );
  }

  const docType = data.document_type ?? 'original_permit';
  const docLabel = DOCUMENT_TYPE_LABELS[docType] ?? docType;
  const hasLimits = TYPES_WITH_LIMITS.includes(docType);
  const limits = data.limits ?? [];
  const canImportPermit = hasLimits && limits.length > 0 && !!data.permit_number;

  return (
    <div className="space-y-4">
      {/* Header with verification badge */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-text-primary">
          Extraction Details
        </h4>
        <div className="flex items-center gap-2">
          <VerificationBadge status={verificationStatus} />
          {verificationStatus !== 'verified' && (
            <button
              onClick={() => can('verify') && setStatus(entry.id, 'verified')}
              disabled={!can('verify')}
              className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-verification-verified/15 text-verification-verified border border-verification-verified/20 hover:bg-verification-verified/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={can('verify') ? 'Mark extraction as verified' : 'Permission required to verify extraction'}
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
        <div className="p-3 rounded-lg bg-qo-nested border border-black/[0.05]">
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
                <tr className="border-b border-black/[0.06] text-text-muted">
                  <th className="text-left py-1.5 pr-3 font-medium">Parameter</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Outfall</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Value</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Unit</th>
                  <th className="text-left py-1.5 pr-3 font-medium">Frequency</th>
                  <th className="text-right py-1.5 font-medium">Action</th>
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
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => can('verify') && setStatus(entry.id, 'disputed')}
                        disabled={!can('verify')}
                        className="p-1 rounded text-text-muted hover:text-verification-disputed transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={can('verify') ? 'Flag issue with this row' : 'Permission required to flag extraction issues'}
                      >
                        <Flag size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {verificationStatus !== 'verified' && (
            <button
              type="button"
              onClick={() => can('verify') && setStatus(entry.id, 'verified')}
              disabled={!can('verify')}
              className="mt-2 px-3 py-1.5 text-[11px] font-medium rounded-md bg-verification-verified/15 text-verification-verified border border-verification-verified/20 hover:bg-verification-verified/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={can('verify') ? 'Mark all extracted limits as verified' : 'Permission required to verify extraction'}
            >
              <CheckCircle2 size={10} className="inline mr-1" />
              Mark All Verified
            </button>
          )}
        </div>
      )}

      {/* Generate DMR Schedule — only for parsed permits with dates */}
      {entry.file_category === 'npdes_permit' &&
        data.effective_date &&
        data.expiration_date &&
        data.permit_number &&
        data.state && (
          <div className="mt-4 pt-3 border-t border-black/[0.06]">
            <button
              onClick={async () => {
                if (!can('process')) return;
                const result = await generateDMRSchedule({
                  queueId: entry.id,
                  permitNumber: data.permit_number!,
                  state: data.state!,
                  effectiveDate: data.effective_date!,
                  expirationDate: data.expiration_date!,
                });
                if (result.error) {
                  toast.error(result.error);
                } else {
                  toast.success(`Generated ${result.generated} DMR obligations`);
                }
              }}
              disabled={!can('process') || generating}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/20 hover:bg-purple-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={can('process') ? undefined : 'Permission required to generate DMR schedule'}
            >
              <CalendarPlus size={12} className="inline mr-1.5" />
              {generating ? 'Generating...' : 'Generate DMR Schedule'}
            </button>
            <p className="text-[10px] text-text-muted mt-1.5">
              Creates recurring DMR submission obligations from {data.effective_date} to {data.expiration_date}
            </p>
          </div>
        )}

      {/* Approve & Import — parsed permit PDF → domain tables */}
      {entry.status === 'parsed' && canImportPermit && (
        <div className="mt-4 pt-3 border-t border-black/[0.06]">
          <button
            onClick={() => can('process') && importPermitLimits(entry.id)}
            disabled={!can('process') || isPermitImporting(entry.id)}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={
              isPermitImporting(entry.id)
                ? 'Importing permit data...'
                : 'Approve and import permit data to database'
            }
            title={can('process') ? undefined : 'Permission required to import parsed files'}
          >
            {isPermitImporting(entry.id) ? (
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
            Creates permit, outfall, and limit rows from AI extraction. Human review recommended before relying on limits.
          </p>
        </div>
      )}

      {entry.status === 'imported' && canImportPermit && (
        <div className="mt-4 pt-3 border-t border-black/[0.06] space-y-2">
          <div className="flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 size={14} />
            <span>Permit data successfully imported to domain tables</span>
          </div>
          {(() => {
            const followUp = getUploadPostProcessFollowUp('npdes_permit');
            if (!followUp) return null;
            return (
              <p className="text-[10px] text-text-muted">
                Open{' '}
                <Link to={followUp.href} className="text-qo-accent hover:text-qo-accent">
                  {followUp.actionLabel}
                </Link>{' '}
                to review imported limits and outfalls.
              </p>
            );
          })()}
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
            <div className="p-2.5 rounded-lg bg-qo-nested border border-black/[0.05] col-span-2">
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

// ---------------------------------------------------------------------------
// NetDMR Extraction Panel
// ---------------------------------------------------------------------------

interface NetDmrExtractionDisplay {
  document_type: 'netdmr_bundle';
  file_count: number;
  total_rows: number;
  parsed_rows: number;
  skipped_rows: number;
  permit_numbers: string[];
  states: string[];
  exceedance_count: number;
  submission_count: number;
  parameters_found: number;
  warnings: string[];
  summary: string;
}

interface NetDmrExtractionPanelProps {
  entry: QueueEntry;
  data: NetDmrExtractionDisplay;
  verificationStatus: VerificationStatus;
  onVerify: () => void;
  onDispute: () => void;
  canVerify: boolean;
}

// ---------------------------------------------------------------------------
// Compliance Archive Extraction Panel
// ---------------------------------------------------------------------------

interface ArchiveExtractionPanelProps {
  entry: QueueEntry;
  data: ArchiveExtractedData;
  verificationStatus: VerificationStatus;
  onVerify: () => void;
  canVerify: boolean;
}

function ArchiveExtractionPanel({
  entry,
  data,
  verificationStatus,
  onVerify,
  canVerify,
}: ArchiveExtractionPanelProps) {
  const categoryKey = data.archive_category ?? entry.file_category;
  const categoryLabel = CATEGORY_BY_DB_KEY[categoryKey]?.label ?? categoryKey;
  const followUp = getUploadPostProcessFollowUp(categoryKey);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-text-primary">Archive Index</h4>
        <div className="flex items-center gap-2">
          <VerificationBadge status={verificationStatus} />
          {verificationStatus !== 'verified' && (
            <button
              onClick={() => canVerify && onVerify()}
              disabled={!canVerify}
              className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-verification-verified/15 text-verification-verified border border-verification-verified/20 hover:bg-verification-verified/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={canVerify ? 'Mark as reviewed' : 'Permission required to verify'}
            >
              <CheckCircle2 size={10} className="inline mr-1" />
              Mark Reviewed
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryItem label="Category" value={categoryLabel} />
        <SummaryItem label="State" value={data.state ?? entry.state_code ?? '—'} />
        <SummaryItem label="Status" value={entry.status} />
      </div>

      {data.summary && (
        <div className="rounded-lg border border-black/[0.06] bg-qo-nested px-3 py-2">
          <p className="text-xs text-text-secondary">{data.summary}</p>
        </div>
      )}

      <div className="pt-3 border-t border-black/[0.06] space-y-2">
        <div className="flex items-center gap-2 text-xs text-green-300">
          <CheckCircle2 size={14} />
          <span>Indexed for org-scoped search</span>
        </div>
        {followUp ? (
          <>
            <p className="text-[10px] text-text-muted">{followUp.panelNote}</p>
            <Link
              to={followUp.href}
              className="inline-flex text-xs font-medium text-qo-accent hover:underline"
            >
              {followUp.actionLabel} →
            </Link>
          </>
        ) : (
          <p className="text-[10px] text-text-muted">
            Indexed for search — open{' '}
            <Link to="/search" className="text-qo-accent hover:underline">
              Search
            </Link>{' '}
            after embedding completes.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NetDMR Extraction Panel
// ---------------------------------------------------------------------------

function NetDmrExtractionPanel({
  entry,
  data,
  verificationStatus,
  onVerify,
  canVerify,
}: NetDmrExtractionPanelProps) {
  const { importNetDmr, isImporting } = useDmrImport();
  const { can } = usePermissions();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-text-primary">NetDMR Bundle Extraction</h4>
        <div className="flex items-center gap-2">
          <VerificationBadge status={verificationStatus} />
          {verificationStatus !== 'verified' && (
            <button
              onClick={() => canVerify && onVerify()}
              disabled={!canVerify}
              className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-verification-verified/15 text-verification-verified border border-verification-verified/20 hover:bg-verification-verified/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={canVerify ? 'Mark extraction as verified' : 'Permission required to verify extraction'}
            >
              <CheckCircle2 size={10} className="inline mr-1" />
              Mark Verified
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryItem label="Files" value={data.file_count} />
        <SummaryItem label="Parsed Rows" value={data.parsed_rows.toLocaleString()} />
        <SummaryItem label="Exceedances" value={data.exceedance_count} />
        <SummaryItem label="Submissions" value={data.submission_count} />
      </div>

      {data.permit_numbers.length > 0 && (
        <div className="p-3 rounded-lg bg-qo-nested border border-black/[0.05]">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Permits</p>
          <p className="text-xs text-text-secondary font-mono">{data.permit_numbers.join(', ')}</p>
        </div>
      )}

      {data.summary && (
        <div className="p-3 rounded-lg bg-qo-nested border border-black/[0.05]">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Summary</p>
          <p className="text-xs text-text-secondary">{data.summary}</p>
        </div>
      )}

      {entry.status === 'parsed' && (
        <div className="mt-4 pt-3 border-t border-black/[0.06]">
          <button
            type="button"
            onClick={() => can('process') && importNetDmr(entry.id)}
            disabled={!can('process') || isImporting(entry.id)}
            aria-busy={isImporting(entry.id)}
            aria-label={
              isImporting(entry.id)
                ? 'Importing DMR submissions...'
                : 'Approve and import DMR data to database'
            }
            className="px-4 py-2 text-xs font-medium rounded-lg bg-green-500/15 text-green-300 border border-green-500/20 hover:bg-green-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title={can('process') ? undefined : 'Permission required to import parsed files'}
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
            Imports up to {data.parsed_rows.toLocaleString()} line items into dmr_submissions and
            dmr_line_items (full file re-parsed server-side)
          </p>
        </div>
      )}

      {entry.status === 'imported' && (
        <div className="mt-4 pt-3 border-t border-black/[0.06] space-y-2">
          <div className="flex items-center gap-2 text-xs text-green-300">
            <CheckCircle2 size={14} />
            <span>DMR data successfully imported to domain tables</span>
          </div>
          <p className="text-[10px] text-text-muted">
            Open{' '}
            <Link to="/dmr" className="text-qo-accent hover:text-qo-accent">
              DMR Submissions
            </Link>{' '}
            to review draft submissions created from this import.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lab Data Extraction Panel
// ---------------------------------------------------------------------------

interface LabDataExtractionPanelProps {
  entry: QueueEntry;
  data: LabDataExtractionDisplay;
  meta: ReturnType<typeof getLabExtractionMeta>;
  verificationStatus: VerificationStatus;
  onVerify: () => void;
  onDispute: () => void;
  canVerify: boolean;
}

function LabDataExtractionPanel({
  entry,
  data,
  meta,
  verificationStatus,
  onVerify,
  onDispute,
  canVerify,
}: LabDataExtractionPanelProps) {
  const [showWarnings, setShowWarnings] = useState(false);
  const [showHoldTime, setShowHoldTime] = useState(false);
  const { importLabData, isImporting } = useLabDataImport();
  const { can } = usePermissions();

  const unmatchedOutfalls = data.outfall_summary.filter((o) => !o.matched_id);
  const dateRange = data.date_range.earliest && data.date_range.latest
    ? `${data.date_range.earliest} — ${data.date_range.latest}`
    : '—';

  return (
    <div className="space-y-4">
      {meta.draftMode && (
        <div className="rounded-lg border border-qo-ochre/30 bg-qo-ochre/10 px-3 py-2.5">
          <p className="text-xs font-medium text-qo-ochre-text">
            DRAFT parser output — internal preview only
          </p>
          <p className="mt-1 text-[11px] text-text-secondary">
            {meta.parserLabel}
            {meta.specVersion ? ` spec v${meta.specVersion}` : ''}
            {meta.parserVersion ? ` · parser v${meta.parserVersion}` : ''}
            . Column mapping may change when client sample files arrive. Verify before import or
            regulatory use.
          </p>
        </div>
      )}

      {/* Header with verification badge */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-text-primary">
          {meta.parserLabel}
        </h4>
        <div className="flex items-center gap-2">
          <VerificationBadge status={verificationStatus} />
          {verificationStatus !== 'verified' && (
            <button
              onClick={() => canVerify && onVerify()}
              disabled={!canVerify}
              className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-verification-verified/15 text-verification-verified border border-verification-verified/20 hover:bg-verification-verified/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={canVerify ? 'Mark extraction as verified' : 'Permission required to verify extraction'}
            >
              <CheckCircle2 size={10} className="inline mr-1" />
              Mark Verified
            </button>
          )}
        </div>
      </div>

      {/* Summary stats row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryItem label="Format" value={data.file_format.toUpperCase()} />
        <SummaryItem label="Parsed Rows" value={data.parsed_rows.toLocaleString()} />
        <SummaryItem label="Date Range" value={dateRange} />
        <SummaryItem label="Parameters" value={data.parameters_found} />
      </div>

      {/* Summary stats row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryItem label="Outfalls" value={data.outfalls_found} />
        <SummaryItem label="Sites" value={data.sites.length} />
        <SummaryItem label="Labs" value={data.lab_names.join(', ') || '—'} />
        <SummaryItem
          label="Hold Time Issues"
          value={data.hold_time_violations.length}
        />
      </div>

      {/* Permit numbers */}
      {data.permit_numbers.length > 0 && (
        <div className="p-3 rounded-lg bg-qo-nested border border-black/[0.05]">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Permit Numbers
          </p>
          <p className="text-xs text-text-secondary font-mono">
            {data.permit_numbers.join(', ')}
          </p>
        </div>
      )}

      {/* Summary text */}
      {data.summary && (
        <div className="p-3 rounded-lg bg-qo-nested border border-black/[0.05]">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Summary</p>
          <p className="text-xs text-text-secondary">{data.summary}</p>
        </div>
      )}

      {/* Parameter summary table */}
      {data.parameter_summary.length > 0 && (
        <div className="mt-3">
          <h5 className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-2">
            Parameters ({data.parameters_found})
          </h5>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-black/[0.06] text-text-muted">
                  <th className="text-left py-1.5 pr-3 font-medium">Parameter</th>
                  <th className="text-right py-1.5 pr-3 font-medium">Samples</th>
                  <th className="text-right py-1.5 pr-3 font-medium">Below Detection</th>
                  <th className="text-right py-1.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.parameter_summary.map((param) => (
                  <tr
                    key={param.canonical_name}
                    className="border-b border-white/[0.03] text-text-secondary"
                  >
                    <td className="py-1.5 pr-3">{param.canonical_name}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{param.sample_count}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">
                      {param.below_detection_count > 0 ? (
                        <span className="text-qo-ochre-text">{param.below_detection_count}</span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => canVerify && onDispute()}
                        disabled={!canVerify}
                        className="p-1 rounded text-text-muted hover:text-verification-disputed transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={canVerify ? 'Flag issue with this parameter' : 'Permission required to flag extraction issues'}
                      >
                        <Flag size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {verificationStatus !== 'verified' && (
            <button
              type="button"
              onClick={() => canVerify && onVerify()}
              disabled={!canVerify}
              className="mt-2 px-3 py-1.5 text-[11px] font-medium rounded-md bg-verification-verified/15 text-verification-verified border border-verification-verified/20 hover:bg-verification-verified/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={canVerify ? 'Mark all extracted parameters as verified' : 'Permission required to verify extraction'}
            >
              <CheckCircle2 size={10} className="inline mr-1" />
              Mark All Verified
            </button>
          )}
        </div>
      )}

      {/* Outfall matching — only show if there are unmatched */}
      {unmatchedOutfalls.length > 0 && (
        <div className="mt-3 p-3 rounded-lg bg-amber-500/[0.06] border border-amber-500/20">
          <h5 className="text-[10px] uppercase tracking-wider text-amber-300 font-medium mb-2">
            <AlertTriangle size={10} className="inline mr-1" />
            Unmatched Outfalls ({unmatchedOutfalls.length})
          </h5>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-amber-500/10 text-text-muted">
                  <th className="text-left py-1.5 pr-3 font-medium">Raw ID</th>
                  <th className="text-right py-1.5 font-medium">Samples</th>
                </tr>
              </thead>
              <tbody>
                {unmatchedOutfalls.map((o) => (
                  <tr
                    key={o.raw_name}
                    className="border-b border-amber-500/5 text-text-secondary"
                  >
                    <td className="py-1.5 pr-3 font-mono">{o.raw_name}</td>
                    <td className="py-1.5 text-right font-mono">{o.sample_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

      {/* Hold time violations — collapsible */}
      {data.hold_time_violations.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowHoldTime(!showHoldTime)}
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-300 font-medium mb-1 hover:text-amber-200 transition-colors"
          >
            {showHoldTime ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            Hold Time Violations ({data.hold_time_violations.length})
          </button>
          {showHoldTime && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-black/[0.06] text-text-muted">
                    <th className="text-left py-1.5 pr-3 font-medium">Row</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Parameter</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Outfall</th>
                    <th className="text-right py-1.5 pr-3 font-medium">Days Held</th>
                    <th className="text-right py-1.5 font-medium">Max Days</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hold_time_violations.map((v, i) => (
                    <tr
                      key={i}
                      className="border-b border-white/[0.03] text-text-secondary"
                    >
                      <td className="py-1.5 pr-3 font-mono">{v.row}</td>
                      <td className="py-1.5 pr-3">{v.parameter}</td>
                      <td className="py-1.5 pr-3 font-mono">{v.outfall}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-status-failed">
                        {v.days_held}
                      </td>
                      <td className="py-1.5 text-right font-mono">{v.max_hold_days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Truncation notice */}
      {data.records_truncated && (
        <p className="text-[10px] text-text-muted italic">
          Record preview truncated. Full data is preserved in the original file.
        </p>
      )}

      {/* Approve & Import — moves parsed data to domain tables */}
      {entry.status === 'parsed' && (
        <div className="mt-4 pt-3 border-t border-black/[0.06]">
          <button
            type="button"
            onClick={() => can('process') && importLabData(entry.id)}
            disabled={!can('process') || isImporting(entry.id)}
            aria-busy={isImporting(entry.id)}
            aria-label={isImporting(entry.id) ? 'Importing lab data...' : 'Approve and import lab data to database'}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-green-500/15 text-green-300 border border-green-500/20 hover:bg-green-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title={can('process') ? undefined : 'Permission required to import parsed files'}
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
            Imports {data.parsed_rows.toLocaleString()} records to sampling_events and lab_results
            tables
            {meta.draftMode ? ' (requires outfall matches in database)' : ''}
          </p>
        </div>
      )}

      {/* Already imported indicator */}
      {entry.status === 'imported' && (
        <div className="mt-4 pt-3 border-t border-black/[0.06] space-y-2">
          <div className="flex items-center gap-2 text-xs text-green-300">
            <CheckCircle2 size={14} />
            <span>Data successfully imported to domain tables</span>
          </div>
          {(() => {
            const followUp = getUploadPostProcessFollowUp('lab_data');
            if (!followUp) return null;
            return (
              <p className="text-[10px] text-text-muted">
                Open{' '}
                <Link to={followUp.href} className="text-qo-accent hover:text-qo-accent">
                  {followUp.actionLabel}
                </Link>{' '}
                to review imported results and exceedances.
              </p>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-2.5 rounded-lg bg-qo-nested border border-black/[0.05]">
      <p className="text-[10px] text-text-muted uppercase tracking-wider">{label}</p>
      <p className="text-sm font-mono font-semibold text-text-primary mt-0.5">
        {value}
      </p>
    </div>
  );
}
