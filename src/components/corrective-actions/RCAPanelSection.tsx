import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronDown, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useRCATemplates } from '@/hooks/useRCATemplates';
import {
  RCA_CATEGORY_LABELS,
  RCA_CATEGORY_COLORS,
  RECURRENCE_RISK_COLORS,
  EMPTY_RCA_FORM,
} from '@/types/rca';
import type { RCAFinding, RCAFormData, RCATemplate, RCACategory, RecurrenceRisk } from '@/types/rca';

interface RCAPanelSectionProps {
  caId: string;
  readOnly?: boolean;
}

/**
 * Structured Root Cause Analysis panel for the CA detail page.
 * Rendered at the root_cause_analysis workflow step.
 */
export function RCAPanelSection({ caId, readOnly = false }: RCAPanelSectionProps) {
  const { templates, loading: templatesLoading, fetchFindings, createFinding, deleteFinding } = useRCATemplates();
  const [findings, setFindings] = useState<RCAFinding[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RCAFormData>({ ...EMPTY_RCA_FORM });
  const [selectedTemplate, setSelectedTemplate] = useState<RCATemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingFindings, setLoadingFindings] = useState(true);

  // Load existing findings
  const loadFindings = useCallback(async () => {
    const data = await fetchFindings(caId);
    setFindings(data);
    setLoadingFindings(false);
  }, [caId, fetchFindings]);

  useEffect(() => {
    loadFindings();
  }, [loadFindings]);

  // Template selection populates form
  function handleTemplateSelect(template: RCATemplate) {
    setSelectedTemplate(template);
    setForm({
      ...EMPTY_RCA_FORM,
      template_id: template.id,
      category: template.category as RCACategory,
      decree_paragraphs: template.decree_paragraphs,
      preventive_recommendation: template.suggested_preventive_actions.join('\n'),
      contributing_factors: [],
    });
  }

  async function handleSubmit() {
    if (!form.root_cause_summary.trim()) return;
    setSaving(true);
    const result = await createFinding(caId, form);
    if (result) {
      setFindings((prev) => [result, ...prev]);
      setForm({ ...EMPTY_RCA_FORM });
      setSelectedTemplate(null);
      setShowForm(false);
    }
    setSaving(false);
  }

  async function handleDelete(findingId: string) {
    const { error } = await deleteFinding(findingId);
    if (!error) {
      setFindings((prev) => prev.filter((f) => f.id !== findingId));
    }
  }

  if (loadingFindings) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Existing findings */}
      {findings.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            RCA Findings ({findings.length})
          </h4>
          {findings.map((finding) => {
            const catColors = RCA_CATEGORY_COLORS[finding.category as RCACategory] ?? RCA_CATEGORY_COLORS.external_factor;
            return (
              <div
                key={finding.id}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                      catColors.bg, catColors.border, catColors.text,
                    )}>
                      {RCA_CATEGORY_LABELS[finding.category as RCACategory] ?? finding.category}
                    </span>
                    {finding.recurrence_risk && (
                      <span className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold border',
                        RECURRENCE_RISK_COLORS[finding.recurrence_risk as RecurrenceRisk]?.bg,
                        RECURRENCE_RISK_COLORS[finding.recurrence_risk as RecurrenceRisk]?.border,
                        RECURRENCE_RISK_COLORS[finding.recurrence_risk as RecurrenceRisk]?.text,
                      )}>
                        Recurrence: {finding.recurrence_risk}
                      </span>
                    )}
                  </div>
                  {!readOnly && (
                    <button
                      onClick={() => handleDelete(finding.id)}
                      className="p-1 text-text-muted hover:text-red-400 transition-colors"
                      aria-label="Delete finding"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <p className="text-sm text-text-secondary">{finding.root_cause_summary}</p>

                {/* 5-Why chain */}
                {(finding.why_1 || finding.why_2) && (
                  <div className="mt-2 space-y-1 pl-3 border-l-2 border-cyan-500/20">
                    {[finding.why_1, finding.why_2, finding.why_3, finding.why_4, finding.why_5]
                      .filter(Boolean)
                      .map((why, i) => (
                        <p key={i} className="text-xs text-text-muted">
                          <span className="text-cyan-400 font-mono mr-1">Why {i + 1}:</span>
                          {why}
                        </p>
                      ))}
                  </div>
                )}

                {finding.preventive_recommendation && (
                  <div className="mt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-0.5">
                      Preventive Recommendation
                    </p>
                    <p className="text-xs text-text-muted whitespace-pre-wrap">
                      {finding.preventive_recommendation}
                    </p>
                  </div>
                )}

                {finding.decree_paragraphs.length > 0 && (
                  <p className="text-[10px] text-amber-400">
                    Decree ¶: {finding.decree_paragraphs.join(', ')}
                  </p>
                )}

                <p className="text-[10px] text-text-muted">
                  Analyzed {new Date(finding.analyzed_at).toLocaleDateString()}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {findings.length === 0 && !showForm && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-6 text-center">
          <AlertTriangle size={24} className="mx-auto text-amber-400 mb-2" />
          <p className="text-sm text-text-muted">No root cause analysis performed yet</p>
          {!readOnly && (
            <p className="text-xs text-text-muted mt-1">
              Use a template or create a custom analysis
            </p>
          )}
        </div>
      )}

      {/* Add button */}
      {!readOnly && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20 transition-colors"
        >
          <Plus size={14} />
          Add Root Cause Analysis
        </button>
      )}

      {/* RCA Form */}
      {showForm && (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4 space-y-4">
          <h4 className="text-sm font-semibold text-text-primary">Root Cause Analysis</h4>

          {/* Template selector */}
          {!templatesLoading && templates.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">
                Start from Template
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <select
                  value={selectedTemplate?.id ?? ''}
                  onChange={(e) => {
                    const tmpl = templates.find((t) => t.id === e.target.value);
                    if (tmpl) handleTemplateSelect(tmpl);
                  }}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] pl-9 pr-3 py-2 text-sm text-text-primary outline-none focus:border-cyan-400/30 appearance-none"
                  aria-label="RCA template"
                >
                  <option value="">Select a template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Category *</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as RCACategory }))}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none focus:border-cyan-400/30"
              aria-label="RCA category"
            >
              {Object.entries(RCA_CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* 5-Why Chain */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-text-muted">5-Why Analysis</label>
            {([1, 2, 3, 4, 5] as const).map((n) => {
              const key = `why_${n}` as keyof RCAFormData;
              const prompt = selectedTemplate?.why_prompts[n - 1];
              return (
                <div key={n}>
                  <label className="block text-[10px] text-cyan-400 font-mono mb-0.5">
                    Why {n}{prompt ? `: ${prompt}` : ''}
                  </label>
                  <input
                    type="text"
                    value={(form[key] as string) || ''}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={prompt ?? `Why ${n}...`}
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-cyan-400/30"
                  />
                </div>
              );
            })}
          </div>

          {/* Root Cause Summary */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Root Cause Summary *
            </label>
            <textarea
              value={form.root_cause_summary}
              onChange={(e) => setForm((f) => ({ ...f, root_cause_summary: e.target.value }))}
              rows={3}
              placeholder="Describe the root cause determined from the analysis..."
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-cyan-400/30"
            />
          </div>

          {/* Recurrence Risk */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Recurrence Risk</label>
            <select
              value={form.recurrence_risk ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, recurrence_risk: (e.target.value || null) as RecurrenceRisk | null }))}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none focus:border-cyan-400/30"
              aria-label="Recurrence risk"
            >
              <option value="">Select...</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {/* Preventive Recommendation */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">
              Preventive Recommendation
            </label>
            <textarea
              value={form.preventive_recommendation}
              onChange={(e) => setForm((f) => ({ ...f, preventive_recommendation: e.target.value }))}
              rows={2}
              placeholder="Recommended actions to prevent recurrence..."
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-cyan-400/30"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSubmit}
              disabled={saving || !form.root_cause_summary.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Analysis'}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setForm({ ...EMPTY_RCA_FORM });
                setSelectedTemplate(null);
              }}
              className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
