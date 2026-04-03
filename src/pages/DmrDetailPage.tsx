import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Shield,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';
import { useDmrSubmissions } from '@/hooks/useDmrSubmissions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import type {
  DmrSubmissionStatus,
  DmrLineItemWithRelations,
  NodiCode,
} from '@/types/database';
import type { DmrSubmissionWithPermit, DmrValidationResult } from '@/hooks/useDmrSubmissions';

// ─── Constants ──────────────────────────────────────────────────────
const STATUS_CONFIG: Record<DmrSubmissionStatus, { label: string; bg: string; text: string; border: string }> = {
  draft:              { label: 'Draft',       bg: 'bg-slate-500/10',   text: 'text-slate-400',   border: 'border-slate-500/20' },
  pending_submission: { label: 'Pending',     bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20' },
  submitted:          { label: 'Submitted',   bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20' },
  accepted:           { label: 'Accepted',    bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  rejected:           { label: 'Rejected',    bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/20' },
  amended:            { label: 'Amended',     bg: 'bg-purple-500/10',  text: 'text-purple-400',  border: 'border-purple-500/20' },
};

const NODI_LABELS: Record<NodiCode, string> = {
  C: 'No Discharge',
  '9': 'Conditional',
  N: 'No Data',
  B: 'Below Detection',
  E: 'Estimate',
  G: 'Greater Than',
  K: 'Actual Value',
  Q: 'Quantity',
  R: 'Rejected',
  T: 'Too Numerous',
  U: 'Unable',
  W: 'Waived',
};

export function DmrDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { log } = useAuditLog();
  const {
    submissions,
    fetchLineItems,
    updateLineItem,
    updateSubmission,
    autoPopulate,
    validateSubmission,
    submitDmr,
    markSubmitted,
  } = useDmrSubmissions();

  const [submission, setSubmission] = useState<DmrSubmissionWithPermit | null>(null);
  const [lineItems, setLineItems] = useState<DmrLineItemWithRelations[]>([]);
  const [validation, setValidation] = useState<DmrValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [populating, setPopulating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmNumber, setConfirmNumber] = useState('');
  const [showSubmitForm, setShowSubmitForm] = useState(false);

  // Find submission and load line items
  const loadDetail = useCallback(async () => {
    const found = submissions.find((s) => s.id === id);
    if (found) setSubmission(found);

    if (id) {
      const items = await fetchLineItems(id);
      setLineItems(items);
    }
    setLoading(false);
  }, [id, submissions, fetchLineItems]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Auto-populate from lab data
  async function handleAutoPopulate() {
    if (!id) return;
    setPopulating(true);
    const result = await autoPopulate(id);
    if (result) {
      const items = await fetchLineItems(id);
      setLineItems(items);
    }
    setPopulating(false);
  }

  // Validate
  async function handleValidate() {
    if (!id) return;
    setValidating(true);
    const result = await validateSubmission(id);
    setValidation(result);
    setValidating(false);
  }

  // Submit DMR
  async function handleSubmit() {
    if (!id) return;
    setSubmitting(true);
    const result = await submitDmr(id);
    if (!result.error) {
      setShowSubmitForm(false);
      await loadDetail();
    }
    setSubmitting(false);
  }

  // Mark as submitted with confirmation number
  async function handleMarkSubmitted() {
    if (!id || !confirmNumber.trim()) return;
    setSubmitting(true);
    const result = await markSubmitted(id, confirmNumber.trim());
    if (!result.error) {
      setConfirmNumber('');
      await loadDetail();
    }
    setSubmitting(false);
  }

  // Update line item inline
  async function handleLineItemUpdate(
    itemId: string,
    field: 'measured_value' | 'nodi_code' | 'comments',
    value: string | number | null,
  ) {
    const updates: Record<string, unknown> = { [field]: value };
    const { error } = await updateLineItem(itemId, updates);
    if (error) {
      toast.error('Failed to update');
      return;
    }
    // Update local state
    setLineItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item,
      ),
    );
  }

  // Toggle no_discharge
  async function handleNoDischargeToggle() {
    if (!submission) return;
    const newVal = !submission.no_discharge;
    const { error } = await updateSubmission(submission.id, {
      no_discharge: newVal,
      nodi_code: newVal ? 'C' : null,
    });
    if (!error) {
      setSubmission({ ...submission, no_discharge: newVal, nodi_code: newVal ? 'C' : null });
    }
  }

  // Export line items CSV
  function handleExportCSV() {
    if (!submission) return;
    const headers = ['Outfall', 'Parameter', 'STORET', 'Statistical Base', 'Limit', 'Limit Unit', 'Measured', 'Unit', 'NODI', 'Exceedance', 'Samples'];
    const rows = lineItems.map((item) =>
      [
        item.outfall?.outfall_id ?? '',
        item.parameter?.name ?? '',
        item.storet_code ?? '',
        item.statistical_base,
        item.limit_value ?? '',
        item.limit_unit ?? '',
        item.measured_value ?? '',
        item.measured_unit ?? '',
        item.nodi_code ?? '',
        item.is_exceedance ? 'YES' : '',
        item.sample_count ?? '',
      ].join(','),
    );
    const disclaimer = '# Generated by SCC Compliance Monitor — a compliance reporting tool. Not an EMS. Not legal or environmental consulting. All data and reports require independent verification by qualified personnel before regulatory submission.';
    const header = `# DMR: ${submission.permit_number ?? 'Unknown'} | Period: ${submission.monitoring_period_start} to ${submission.monitoring_period_end}`;
    const csv = `${disclaimer}\n${header}\n${headers.join(',')}\n${rows.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dmr-${submission.permit_number ?? 'export'}-${submission.monitoring_period_start}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    log('report_generated', { type: 'dmr_line_items_csv', submission_id: id }, { module: 'dmr', tableName: 'dmr_submissions', recordId: id });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <p className="text-text-muted">DMR submission not found</p>
        <Link to="/dmr" className="text-sm text-blue-400 hover:text-blue-300">Back to list</Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[submission.status];
  const isDraft = submission.status === 'draft';
  const isEditable = isDraft || submission.status === 'rejected';
  const exceedanceCount = lineItems.filter((i) => i.is_exceedance).length;
  const missingCount = lineItems.filter((i) => i.measured_value === null && i.nodi_code === null).length;

  // Group line items by outfall
  const outfallGroups = new Map<string, DmrLineItemWithRelations[]>();
  for (const item of lineItems) {
    const key = item.outfall?.outfall_id ?? 'Unknown';
    const group = outfallGroups.get(key) ?? [];
    group.push(item);
    outfallGroups.set(key, group);
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Back */}
      <Link to="/dmr" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
        <ArrowLeft size={12} /> All Submissions
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2.5 rounded-xl border', statusCfg.bg, statusCfg.border)}>
            <FileText className={cn('h-6 w-6', statusCfg.text)} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">
              {submission.permit_number ?? 'Unknown Permit'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase border', statusCfg.bg, statusCfg.border, statusCfg.text)}>
                {statusCfg.label}
              </span>
              <span className="text-xs text-text-muted">
                {submission.submission_type} · {submission.monitoring_period_start} — {submission.monitoring_period_end}
              </span>
              {submission.site_name && <span className="text-xs text-text-muted">· {submission.site_name}</span>}
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {isEditable && (
            <>
              <button
                onClick={handleAutoPopulate}
                disabled={populating}
                className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-sm font-medium text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={14} className={populating ? 'animate-spin' : ''} />
                {populating ? 'Populating...' : 'Auto-Populate'}
              </button>
              <button
                onClick={handleValidate}
                disabled={validating}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
              >
                <Shield size={14} />
                {validating ? 'Validating...' : 'Validate'}
              </button>
            </>
          )}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/[0.1] transition-colors"
          >
            <Download size={14} />
            Export CSV
          </button>
          {isDraft && lineItems.length > 0 && (
            <button
              onClick={() => setShowSubmitForm(true)}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/20 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors"
            >
              <Send size={14} />
              Submit DMR
            </button>
          )}
          {submission.status === 'pending_submission' && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={confirmNumber}
                onChange={(e) => setConfirmNumber(e.target.value)}
                placeholder="Confirmation #"
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-emerald-400/30 w-40"
              />
              <button
                onClick={handleMarkSubmitted}
                disabled={!confirmNumber.trim() || submitting}
                className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
              >
                Confirm
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Submit confirmation form */}
      {showSubmitForm && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4 space-y-3">
          <p className="text-sm text-text-secondary">
            This will mark the DMR as pending submission. You&apos;ll need to upload it to the state system ({submission.submission_type}) and enter the confirmation number.
          </p>
          {missingCount > 0 && (
            <p className="text-xs text-amber-400">
              ⚠ {missingCount} line items still have no measured value or NODI code
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={submitting} className="rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors">
              {submitting ? 'Submitting...' : 'Confirm Submit'}
            </button>
            <button onClick={() => setShowSubmitForm(false)} className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-secondary transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* No Discharge toggle */}
      {isEditable && (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={submission.no_discharge}
              onChange={handleNoDischargeToggle}
              className="rounded border-white/[0.2] bg-white/[0.05] text-blue-400 focus:ring-blue-400/30"
            />
            <span className="text-sm text-text-secondary">No Discharge this period</span>
          </label>
          {submission.no_discharge && (
            <span className="text-xs text-blue-400 font-mono">NODI: C</span>
          )}
        </div>
      )}

      {/* Validation results */}
      {validation && (
        <div className={cn(
          'rounded-xl border p-4 space-y-2',
          validation.valid ? 'border-emerald-500/20 bg-emerald-500/[0.03]' : 'border-red-500/20 bg-red-500/[0.03]',
        )}>
          <div className="flex items-center gap-2">
            {validation.valid ? (
              <CheckCircle2 size={16} className="text-emerald-400" />
            ) : (
              <AlertTriangle size={16} className="text-red-400" />
            )}
            <span className={cn('text-sm font-medium', validation.valid ? 'text-emerald-400' : 'text-red-400')}>
              {validation.valid ? 'Ready for submission' : 'Validation errors found'}
            </span>
          </div>
          {validation.errors.map((err, i) => (
            <p key={i} className="text-xs text-red-400 ml-6">• {err.message}</p>
          ))}
          {validation.warnings.map((warn, i) => (
            <p key={i} className="text-xs text-amber-400 ml-6">⚠ {warn.message}</p>
          ))}
          <div className="text-xs text-text-muted ml-6">
            {validation.total_items} items · {validation.populated} populated · {validation.missing} missing · {validation.exceedances} exceedances
          </div>
        </div>
      )}

      {/* Summary bar */}
      {lineItems.length > 0 && (
        <div className="flex gap-6 text-sm text-text-muted">
          <span>{lineItems.length} line items</span>
          {exceedanceCount > 0 && <span className="text-red-400">{exceedanceCount} exceedances</span>}
          {missingCount > 0 && <span className="text-amber-400">{missingCount} missing values</span>}
          <span>{outfallGroups.size} outfalls</span>
        </div>
      )}

      {/* Line items by outfall */}
      {submission.no_discharge ? (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.03] p-8 text-center">
          <p className="text-sm text-blue-400">No Discharge — no line items required</p>
          <p className="text-xs text-text-muted mt-1">NODI Code: C (No Discharge)</p>
        </div>
      ) : lineItems.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-8 text-center">
          <FileText size={32} className="mx-auto text-text-muted mb-3" />
          <p className="text-sm text-text-muted">No line items yet</p>
          <p className="text-xs text-text-muted mt-1">Click &quot;Auto-Populate&quot; to fill from lab data, or add manually</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(outfallGroups.entries()).map(([outfallId, items]) => (
            <SpotlightCard key={outfallId} className="overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06]">
                <h3 className="text-sm font-semibold text-text-primary">
                  Outfall {outfallId}
                  <span className="ml-2 text-xs font-normal text-text-muted">{items.length} parameters</span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      <th className="px-3 py-2 text-left text-text-muted font-medium">Parameter</th>
                      <th className="px-3 py-2 text-left text-text-muted font-medium">STORET</th>
                      <th className="px-3 py-2 text-left text-text-muted font-medium">Stat Base</th>
                      <th className="px-3 py-2 text-right text-text-muted font-medium">Limit</th>
                      <th className="px-3 py-2 text-right text-text-muted font-medium">Measured</th>
                      <th className="px-3 py-2 text-center text-text-muted font-medium">NODI</th>
                      <th className="px-3 py-2 text-center text-text-muted font-medium">Samples</th>
                      <th className="px-3 py-2 text-left text-text-muted font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className={cn(
                          'hover:bg-white/[0.02]',
                          item.is_exceedance && 'bg-red-500/[0.03]',
                        )}
                      >
                        <td className="px-3 py-2 text-text-secondary font-medium">
                          {item.parameter?.name ?? 'Unknown'}
                        </td>
                        <td className="px-3 py-2 text-text-muted font-mono">
                          {item.storet_code ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-text-muted">
                          {item.statistical_base.replace('_', ' ')}
                        </td>
                        <td className="px-3 py-2 text-right text-text-muted font-mono">
                          {item.limit_value != null ? `${item.limit_value} ${item.limit_unit ?? ''}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isEditable ? (
                            <input
                              type="number"
                              step="any"
                              value={item.measured_value ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? null : Number(e.target.value);
                                handleLineItemUpdate(item.id, 'measured_value', val);
                              }}
                              className={cn(
                                'w-24 rounded border px-2 py-0.5 text-right font-mono outline-none',
                                'border-white/[0.08] bg-white/[0.03] text-text-primary focus:border-blue-400/30',
                                item.is_exceedance && 'border-red-500/30 text-red-400',
                              )}
                              aria-label={`Measured value for ${item.parameter?.name ?? 'parameter'}`}
                            />
                          ) : (
                            <span className={cn('font-mono', item.is_exceedance && 'text-red-400 font-bold')}>
                              {item.measured_value != null ? `${item.measured_value} ${item.measured_unit ?? ''}` : '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isEditable ? (
                            <select
                              value={item.nodi_code ?? ''}
                              onChange={(e) => handleLineItemUpdate(item.id, 'nodi_code', e.target.value || null)}
                              className="rounded border border-white/[0.08] bg-white/[0.03] px-1 py-0.5 text-text-primary outline-none focus:border-blue-400/30"
                              aria-label={`NODI code for ${item.parameter?.name ?? 'parameter'}`}
                            >
                              <option value="">—</option>
                              {Object.entries(NODI_LABELS).map(([code, label]) => (
                                <option key={code} value={code}>{code} - {label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-text-muted font-mono">
                              {item.nodi_code ?? '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-text-muted font-mono">
                          {item.sample_count ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          {item.is_exceedance ? (
                            <span className="inline-flex items-center gap-1 text-red-400 font-semibold">
                              <AlertTriangle size={12} />
                              {item.exceedance_pct != null ? `+${item.exceedance_pct}%` : 'EXCEED'}
                            </span>
                          ) : item.measured_value != null ? (
                            <span className="text-emerald-400">✓</span>
                          ) : item.nodi_code ? (
                            <span className="text-blue-400 font-mono">{item.nodi_code}</span>
                          ) : (
                            <span className="text-amber-400">Missing</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SpotlightCard>
          ))}
        </div>
      )}

      {/* Submission metadata */}
      {submission.submitted_at && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-xs text-text-muted space-y-1">
          <p>Submitted: {new Date(submission.submitted_at).toLocaleString()}</p>
          {submission.submission_confirmation && (
            <p>Confirmation: <span className="text-blue-400 font-mono">{submission.submission_confirmation}</span></p>
          )}
        </div>
      )}
    </div>
  );
}

export default DmrDetailPage;
