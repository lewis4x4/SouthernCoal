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
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useDmrSubmissions } from '@/hooks/useDmrSubmissions';
import { useAuditLog } from '@/hooks/useAuditLog';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import type {
  DmrSubmissionStatus,
  DmrLineItemWithRelations,
  NodiCode,
} from '@/types/database';
import type { DmrSubmissionWithPermit, DmrValidationResult } from '@/hooks/useDmrSubmissions';
import type { DmrCalculationWarning } from '@/lib/dmrSchema';

// ─── Constants ──────────────────────────────────────────────────────
const STATUS_CONFIG: Record<DmrSubmissionStatus, { label: string; bg: string; text: string; border: string }> = {
  draft:              { label: 'Draft',       bg: 'bg-slate-500/10',   text: 'text-slate-400',   border: 'border-slate-500/20' },
  pending_submission: { label: 'Pending',     bg: 'bg-amber-500/10',   text: 'text-qo-ochre-text',   border: 'border-amber-500/20' },
  submitted:          { label: 'Submitted',   bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20' },
  accepted:           { label: 'Accepted',    bg: 'bg-emerald-500/10', text: 'text-qo-sage-text', border: 'border-emerald-500/20' },
  rejected:           { label: 'Rejected',    bg: 'bg-red-500/10',     text: 'text-qo-risk',     border: 'border-red-500/20' },
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
    fetchSubmissionById,
    fetchLineItems,
    updateLineItem,
    createLineItem,
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
  const [showAddLineItem, setShowAddLineItem] = useState(false);
  const [addOutfallId, setAddOutfallId] = useState('');
  const [addParameterId, setAddParameterId] = useState('');
  const [addMeasuredValue, setAddMeasuredValue] = useState('');
  const [addNodi, setAddNodi] = useState<NodiCode | ''>('');
  const [permitLimits, setPermitLimits] = useState<Array<{ outfall_id: string; parameter_id: string; label: string }>>([]);

  // Find submission and load line items
  const loadDetail = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    const found = await fetchSubmissionById(id);
    setSubmission(found);
    const items = await fetchLineItems(id);
    setLineItems(items);
    setLoading(false);
  }, [id, fetchSubmissionById, fetchLineItems]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    async function loadLimits() {
      if (!submission?.permit_id) return;
      const { data: outfalls } = await supabase
        .from('outfalls')
        .select('id')
        .eq('permit_id', submission.permit_id);
      const outfallIds = (outfalls ?? []).map((o) => o.id);
      if (outfallIds.length === 0) return;

      const { data } = await supabase
        .from('permit_limits')
        .select('outfall_id, parameter_id, outfall:outfalls(outfall_number), parameter:parameters(name)')
        .eq('is_active', true)
        .in('outfall_id', outfallIds);

      setPermitLimits(
        (data ?? []).map((row) => {
          const outfall = row.outfall as { outfall_number?: string } | null;
          const parameter = row.parameter as { name?: string } | null;
          return {
            outfall_id: row.outfall_id as string,
            parameter_id: row.parameter_id as string,
            label: `${outfall?.outfall_number ?? '?'} — ${parameter?.name ?? 'Parameter'}`,
          };
        }),
      );
    }
    void loadLimits();
  }, [submission?.permit_id]);

  async function handleAddLineItem() {
    if (!id || !addOutfallId || !addParameterId) {
      toast.error('Select outfall and parameter');
      return;
    }
    const measured = addMeasuredValue.trim() ? Number(addMeasuredValue) : null;
    const { error } = await createLineItem(id, {
      outfall_id: addOutfallId,
      parameter_id: addParameterId,
      measured_value: measured,
      nodi_code: addNodi || null,
    });
    if (error) {
      toast.error(`Failed to add line item: ${error}`);
      return;
    }
    toast.success('Line item added');
    setShowAddLineItem(false);
    setAddOutfallId('');
    setAddParameterId('');
    setAddMeasuredValue('');
    setAddNodi('');
    const items = await fetchLineItems(id);
    setLineItems(items);
    log('report_generated', { type: 'dmr_line_item_added', submission_id: id, outfall_id: addOutfallId, parameter_id: addParameterId }, {
      module: 'dmr',
      tableName: 'dmr_line_items',
      recordId: id,
    });
  }

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
        item.outfall?.outfall_number ?? '',
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

  const conversionWarningCount = lineItems.reduce((count, item) => {
    const warnings = (item as DmrLineItemWithRelations & { calculation_warnings?: DmrCalculationWarning[] })
      .calculation_warnings;
    return count + (warnings?.length ?? 0);
  }, 0);
  const showMassLoading = lineItems.some(
    (item) =>
      (item as DmrLineItemWithRelations & { mass_loading_lbs_day?: number | null }).mass_loading_lbs_day != null,
  );

  // Group line items by outfall
  const outfallGroups = new Map<string, DmrLineItemWithRelations[]>();
  for (const item of lineItems) {
    const key = item.outfall?.outfall_number ?? 'Unknown';
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
              {submission.federal_npdes_id &&
              submission.federal_npdes_id !== submission.permit_number?.toUpperCase() ? (
                <span className="ml-2 font-mono text-base font-normal text-qo-accent">
                  → {submission.federal_npdes_id}
                </span>
              ) : null}
            </h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase border', statusCfg.bg, statusCfg.border, statusCfg.text)}>
                {statusCfg.label}
              </span>
              <span className="text-xs text-text-muted">
                {submission.submission_type} · {submission.monitoring_period_start} — {submission.monitoring_period_end}
              </span>
              {submission.site_name && <span className="text-xs text-text-muted">· {submission.site_name}</span>}
              {submission.source_file_id && (
                <span className="text-[10px] rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-purple-300">
                  NetDMR import
                </span>
              )}
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
            className="flex items-center gap-1.5 rounded-lg bg-black/[0.04] border border-black/[0.08] px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/[0.1] transition-colors"
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
                className="rounded-lg border border-black/[0.08] bg-qo-nested px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-emerald-400/30 w-40"
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

      {submission.source_file_id && lineItems.length > 0 && (
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.05] px-4 py-3 text-xs text-purple-200/90">
          Imported from NetDMR via Upload Dashboard ({lineItems.length} line items). Review
          values, run Validate, then Submit when ready. Use Auto-Populate to merge lab data for
          the same monitoring period.
        </div>
      )}

      {/* Submit confirmation form */}
      {showSubmitForm && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4 space-y-3">
          <p className="text-sm text-text-secondary">
            This will mark the DMR as pending submission. You&apos;ll need to upload it to the state system ({submission.submission_type}) and enter the confirmation number.
          </p>
          {missingCount > 0 && (
            <p className="text-xs text-qo-ochre-text">
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
              className="rounded border-white/[0.2] bg-black/[0.03] text-blue-400 focus:ring-blue-400/30"
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
              <CheckCircle2 size={16} className="text-qo-sage-text" />
            ) : (
              <AlertTriangle size={16} className="text-qo-risk" />
            )}
            <span className={cn('text-sm font-medium', validation.valid ? 'text-qo-sage-text' : 'text-qo-risk')}>
              {validation.valid ? 'Ready for submission' : 'Validation errors found'}
            </span>
          </div>
          {validation.errors.map((err, i) => (
            <p key={i} className="text-xs text-qo-risk ml-6">• {err.message}</p>
          ))}
          {validation.warnings.map((warn, i) => (
            <p key={i} className="text-xs text-qo-ochre-text ml-6">⚠ {warn.message}</p>
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
          {exceedanceCount > 0 && <span className="text-qo-risk">{exceedanceCount} exceedances</span>}
          {missingCount > 0 && <span className="text-qo-ochre-text">{missingCount} missing values</span>}
          {conversionWarningCount > 0 && (
            <span className="text-qo-ochre-text">{conversionWarningCount} unit conversion warning(s)</span>
          )}
          <span>{outfallGroups.size} outfalls</span>
        </div>
      )}

      {isEditable && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowAddLineItem((v) => !v)}
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-text-secondary hover:bg-white/5"
          >
            <Plus size={14} />
            Add line item manually
          </button>
          {showAddLineItem && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3 max-w-xl">
              <select
                value={addOutfallId && addParameterId ? `${addOutfallId}:${addParameterId}` : ''}
                onChange={(e) => {
                  const [o, p] = e.target.value.split(':');
                  setAddOutfallId(o ?? '');
                  setAddParameterId(p ?? '');
                }}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
              >
                <option value="">Select outfall / parameter…</option>
                {permitLimits.map((pl) => (
                  <option key={`${pl.outfall_id}:${pl.parameter_id}`} value={`${pl.outfall_id}:${pl.parameter_id}`}>
                    {pl.label}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Measured value (optional)"
                  value={addMeasuredValue}
                  onChange={(e) => setAddMeasuredValue(e.target.value)}
                  className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
                <select
                  value={addNodi}
                  onChange={(e) => setAddNodi(e.target.value as NodiCode | '')}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
                >
                  <option value="">NODI…</option>
                  {Object.keys(NODI_LABELS).map((code) => (
                    <option key={code} value={code}>{code} — {NODI_LABELS[code as NodiCode]}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void handleAddLineItem()}
                className="rounded-lg bg-blue-500/15 px-4 py-2 text-sm text-blue-300 hover:bg-blue-500/25"
              >
                Add line item
              </button>
            </div>
          )}
        </div>
      )}

      {/* Line items by outfall */}
      {submission.no_discharge ? (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.03] p-8 text-center">
          <p className="text-sm text-blue-400">No Discharge — no line items required</p>
          <p className="text-xs text-text-muted mt-1">NODI Code: C (No Discharge)</p>
        </div>
      ) : lineItems.length === 0 ? (
        <div className="rounded-xl border border-black/[0.06] bg-white p-8 text-center">
          <FileText size={32} className="mx-auto text-text-muted mb-3" />
          <p className="text-sm text-text-muted">No line items yet</p>
          <p className="text-xs text-text-muted mt-1">Click &quot;Auto-Populate&quot; to fill from lab data, or add manually</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(outfallGroups.entries()).map(([outfallId, items]) => (
            <SpotlightCard key={outfallId} className="overflow-hidden">
              <div className="px-4 py-3 border-b border-black/[0.06]">
                <h3 className="text-sm font-semibold text-text-primary">
                  Outfall {outfallId}
                  <span className="ml-2 text-xs font-normal text-text-muted">{items.length} parameters</span>
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-black/[0.05]">
                      <th className="px-3 py-2 text-left text-text-muted font-medium">Parameter</th>
                      <th className="px-3 py-2 text-left text-text-muted font-medium">STORET</th>
                      <th className="px-3 py-2 text-left text-text-muted font-medium">Stat Base</th>
                      <th className="px-3 py-2 text-right text-text-muted font-medium">Limit</th>
                      <th className="px-3 py-2 text-right text-text-muted font-medium">Measured</th>
                      {showMassLoading && (
                        <th className="px-3 py-2 text-right text-text-muted font-medium">Mass load</th>
                      )}
                      <th className="px-3 py-2 text-center text-text-muted font-medium">NODI</th>
                      <th className="px-3 py-2 text-center text-text-muted font-medium">Samples</th>
                      <th className="px-3 py-2 text-left text-text-muted font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {items.map((item) => {
                      const itemWarnings =
                        (item as DmrLineItemWithRelations & { calculation_warnings?: DmrCalculationWarning[] })
                          .calculation_warnings ?? [];
                      const massLoading =
                        (item as DmrLineItemWithRelations & { mass_loading_lbs_day?: number | null })
                          .mass_loading_lbs_day;
                      return (
                      <tr
                        key={item.id}
                        className={cn(
                          'hover:bg-qo-nested',
                          item.is_exceedance && 'bg-red-500/[0.03]',
                          itemWarnings.length > 0 && 'bg-amber-500/[0.03]',
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
                                'border-black/[0.08] bg-qo-nested text-text-primary focus:border-blue-400/30',
                                item.is_exceedance && 'border-red-500/30 text-qo-risk',
                              )}
                              aria-label={`Measured value for ${item.parameter?.name ?? 'parameter'}`}
                            />
                          ) : (
                            <span className={cn('font-mono', item.is_exceedance && 'text-qo-risk font-bold')}>
                              {item.measured_value != null ? `${item.measured_value} ${item.measured_unit ?? ''}` : '—'}
                            </span>
                          )}
                        </td>
                        {showMassLoading && (
                          <td className="px-3 py-2 text-right font-mono text-text-muted">
                            {massLoading != null ? `${massLoading} lbs/day` : '—'}
                          </td>
                        )}
                        <td className="px-3 py-2 text-center">
                          {isEditable ? (
                            <select
                              value={item.nodi_code ?? ''}
                              onChange={(e) => handleLineItemUpdate(item.id, 'nodi_code', e.target.value || null)}
                              className="rounded border border-black/[0.08] bg-qo-nested px-1 py-0.5 text-text-primary outline-none focus:border-blue-400/30"
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
                            <span className="inline-flex items-center gap-1 text-qo-risk font-semibold">
                              <AlertTriangle size={12} />
                              {item.exceedance_pct != null ? `+${item.exceedance_pct}%` : 'EXCEED'}
                            </span>
                          ) : itemWarnings.length > 0 ? (
                            <span
                              className="inline-flex items-center gap-1 text-qo-ochre-text"
                              title={itemWarnings.map((w) => w.message).join(' · ')}
                            >
                              <AlertTriangle size={12} />
                              Unit conversion
                            </span>
                          ) : item.measured_value != null ? (
                            <span className="text-qo-sage-text">✓</span>
                          ) : item.nodi_code ? (
                            <span className="text-blue-400 font-mono">{item.nodi_code}</span>
                          ) : (
                            <span className="text-qo-ochre-text">Missing</span>
                          )}
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            </SpotlightCard>
          ))}
        </div>
      )}

      {/* Submission metadata */}
      {submission.submitted_at && (
        <div className="rounded-xl border border-black/[0.08] bg-qo-nested p-4 text-xs text-text-muted space-y-1">
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
