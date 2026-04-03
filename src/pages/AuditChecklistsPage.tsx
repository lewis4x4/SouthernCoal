import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useAuditChecklists, CHECKLIST_TEMPLATES } from '@/hooks/useAuditChecklists';
import { useDocumentCompleteness } from '@/hooks/useDocumentCompleteness';
import {
  ClipboardCheck,
  Plus,
  Gauge,
  AlertTriangle,
  Filter,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { AuditType, ChecklistStatus } from '@/types/database';

const AUDIT_TYPE_LABELS: Record<AuditType, string> = {
  epa_inspection: 'EPA Inspection',
  state_dep_audit: 'State DEP Audit',
  consent_decree_review: 'Consent Decree Review',
  internal_audit: 'Internal Audit',
  msha_inspection: 'MSHA Inspection',
  osmre_inspection: 'OSMRE Inspection',
  custom: 'Custom',
};

const STATUS_LABELS: Record<ChecklistStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  in_progress: 'In Progress',
  complete: 'Complete',
  archived: 'Archived',
};

const STATUS_COLORS: Record<ChecklistStatus, string> = {
  draft: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  active: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  in_progress: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  complete: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  archived: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export function AuditChecklistsPage() {
  const { checklists, loading, createFromTemplate } = useAuditChecklists();
  const { readinessScore } = useDocumentCompleteness();
  const [statusFilter, setStatusFilter] = useState<ChecklistStatus | 'all'>('all');
  const [showTemplates, setShowTemplates] = useState(false);

  const filtered = statusFilter === 'all'
    ? checklists
    : checklists.filter((c) => c.status === statusFilter);

  const handleCreateFromTemplate = async (templateIndex: number) => {
    const template = CHECKLIST_TEMPLATES[templateIndex];
    if (!template) return;
    await createFromTemplate(template);
    setShowTemplates(false);
  };

  const scoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-400';
    if (score >= 70) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/20">
            <ClipboardCheck className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Audit Checklists</h1>
            <p className="text-sm text-text-secondary">Audit preparation and readiness tracking</p>
          </div>
        </div>
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/30"
        >
          <Plus className="w-4 h-4" />
          New Checklist
        </button>
      </div>

      {/* Readiness Score */}
      {readinessScore && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <SpotlightCard className="p-4 text-center">
            <Gauge className={clsx('w-6 h-6 mx-auto mb-1', scoreColor(readinessScore.overall_score))} />
            <div className={clsx('text-3xl font-bold', scoreColor(readinessScore.overall_score))}>
              {readinessScore.overall_score}
            </div>
            <div className="text-xs text-text-secondary">Audit Readiness</div>
          </SpotlightCard>
          <SpotlightCard className="p-4 text-center">
            <div className={clsx('text-2xl font-bold', scoreColor(readinessScore.checklist_score))}>
              {readinessScore.checklist_score}%
            </div>
            <div className="text-xs text-text-secondary">
              Checklists ({readinessScore.checklist_completed}/{readinessScore.checklist_total})
            </div>
          </SpotlightCard>
          <SpotlightCard className="p-4 text-center">
            <div className={clsx('text-2xl font-bold', scoreColor(readinessScore.document_score))}>
              {readinessScore.document_score}%
            </div>
            <div className="text-xs text-text-secondary">
              Documents ({readinessScore.document_current}/{readinessScore.document_total})
            </div>
          </SpotlightCard>
          <SpotlightCard className="p-4 text-center">
            <div className={clsx('text-2xl font-bold', scoreColor(readinessScore.evidence_score))}>
              {readinessScore.evidence_score}%
            </div>
            <div className="text-xs text-text-secondary">
              Evidence ({readinessScore.obligations_evidenced}/{readinessScore.obligations_total})
            </div>
          </SpotlightCard>
        </div>
      )}

      {/* Template Selector */}
      {showTemplates && (
        <SpotlightCard className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Choose a Template</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {CHECKLIST_TEMPLATES.map((template, i) => (
              <button
                key={template.audit_type}
                onClick={() => handleCreateFromTemplate(i)}
                className="p-4 text-left rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/5 transition-colors"
              >
                <div className="text-white font-medium mb-1">{template.label}</div>
                <div className="text-xs text-text-secondary">{template.items.length} items</div>
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowTemplates(false)}
            className="mt-3 text-sm text-text-secondary hover:text-white"
          >
            Cancel
          </button>
        </SpotlightCard>
      )}

      {/* Status Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-text-secondary" />
        {['all', 'active', 'in_progress', 'complete', 'draft', 'archived'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s as ChecklistStatus | 'all')}
            className={clsx(
              'px-3 py-1 text-xs rounded-lg border transition-colors',
              statusFilter === s
                ? 'bg-white/10 border-white/20 text-white'
                : 'border-transparent text-text-secondary hover:text-white',
            )}
          >
            {s === 'all' ? 'All' : STATUS_LABELS[s as ChecklistStatus]}
          </button>
        ))}
      </div>

      {/* Checklists */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-indigo-400 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <SpotlightCard className="p-12 text-center">
          <ClipboardCheck className="w-8 h-8 text-text-secondary mx-auto mb-3" />
          <p className="text-text-secondary">No checklists found</p>
        </SpotlightCard>
      ) : (
        <div className="space-y-2">
          {filtered.map((cl) => {
            const progress = cl.total_items > 0
              ? Math.round((cl.completed_items / cl.total_items) * 100)
              : 0;
            const isOverdue = cl.target_date && new Date(cl.target_date) < new Date() && cl.status !== 'complete';

            return (
              <Link key={cl.id} to={`/audit/checklists/${cl.id}`}>
                <SpotlightCard className="p-4 hover:bg-white/[0.04] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-medium truncate">{cl.title}</h3>
                        {isOverdue && (
                          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-secondary">
                        <span>{AUDIT_TYPE_LABELS[cl.audit_type]}</span>
                        {cl.state_code && <span>{cl.state_code}</span>}
                        {cl.target_date && (
                          <span className={clsx(isOverdue && 'text-red-400')}>
                            Target: {cl.target_date}
                          </span>
                        )}
                        <span>
                          {cl.completed_items}/{cl.total_items} items
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      {/* Progress bar */}
                      <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={clsx(
                            'h-full rounded-full transition-all',
                            progress === 100 ? 'bg-emerald-500' : progress >= 50 ? 'bg-cyan-500' : 'bg-amber-500',
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-text-secondary w-8 text-right">{progress}%</span>
                      <span className={clsx('px-2 py-0.5 rounded text-xs font-medium border', STATUS_COLORS[cl.status])}>
                        {STATUS_LABELS[cl.status]}
                      </span>
                    </div>
                  </div>
                </SpotlightCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AuditChecklistsPage;
