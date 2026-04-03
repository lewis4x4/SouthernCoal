import { useState } from 'react';
import { Award, Plus, CheckCircle2, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useTraining } from '@/hooks/useTraining';
import {
  TRAINING_CATEGORY_LABELS,
  COMPLETION_STATUS_COLORS,
} from '@/types/training';
import type { TrainingCategory } from '@/types/training';

const CATEGORIES: TrainingCategory[] = ['safety', 'compliance', 'field_operations', 'equipment', 'regulatory', 'general'];

export function TrainingAdminPage() {
  const { catalog, completions, loading, addCatalogItem, verifyCompletion } = useTraining();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<TrainingCategory>('general');
  const [newIsCert, setNewIsCert] = useState(false);
  const [newValidity, setNewValidity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'catalog' | 'completions'>('catalog');

  async function handleAdd() {
    if (!newName.trim()) return;
    setSubmitting(true);
    const result = await addCatalogItem({
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      category: newCategory,
      is_certification: newIsCert,
      validity_months: newValidity ? parseInt(newValidity, 10) : undefined,
    });
    setSubmitting(false);
    if (!result.error) {
      setNewName('');
      setNewDescription('');
      setNewCategory('general');
      setNewIsCert(false);
      setNewValidity('');
      setShowAddForm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const pendingVerification = completions.filter((c) => c.status === 'pending_verification');

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="inline-flex rounded-xl bg-emerald-500/10 p-2.5">
          <Award className="h-6 w-6 text-emerald-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Training & Certification
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Manage training catalog, requirements, and verify completions. Expired certifications block field dispatch.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 rounded-xl bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25 transition-colors"
        >
          <Plus size={16} />
          Add Training
        </button>
      </div>

      {/* Pending verifications alert */}
      {pendingVerification.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] px-4 py-3">
          <Clock size={18} className="text-amber-400 shrink-0" />
          <span className="text-sm text-text-secondary">
            <strong className="text-amber-300">{pendingVerification.length}</strong> completion{pendingVerification.length !== 1 ? 's' : ''} pending verification
          </span>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <SpotlightCard spotlightColor="rgba(16, 185, 129, 0.08)" className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-text-primary">New Training Item</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Training name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-cyan-400/30"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as TrainingCategory)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none focus:border-cyan-400/30"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{TRAINING_CATEGORY_LABELS[cat]}</option>
              ))}
            </select>
          </div>
          <textarea
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-cyan-400/30"
          />
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={newIsCert}
                onChange={(e) => setNewIsCert(e.target.checked)}
                className="rounded border-white/20"
              />
              Is a certification
            </label>
            {newIsCert && (
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                Valid for
                <input
                  type="number"
                  placeholder="months"
                  value={newValidity}
                  onChange={(e) => setNewValidity(e.target.value)}
                  className="w-20 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-sm text-text-primary outline-none focus:border-cyan-400/30"
                />
                months
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || submitting}
              className="rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </SpotlightCard>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.06] pb-0">
        {(['catalog', 'completions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors border-b-2',
              activeTab === tab
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-text-muted hover:text-text-secondary',
            )}
          >
            {tab === 'catalog' ? 'Training Catalog' : 'Completions'}
            {tab === 'completions' && pendingVerification.length > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                {pendingVerification.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Catalog tab */}
      {activeTab === 'catalog' && (
        <div className="space-y-3">
          {catalog.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center text-sm text-text-muted">
              No training items yet. Add your first training course or certification above.
            </div>
          ) : (
            CATEGORIES.filter((cat) => catalog.some((c) => c.category === cat)).map((cat) => (
              <div key={cat}>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {TRAINING_CATEGORY_LABELS[cat]}
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {catalog
                    .filter((c) => c.category === cat)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text-primary">{item.name}</span>
                          {item.is_certification && (
                            <span className="rounded-full bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-purple-400">
                              Cert
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="mt-1 text-xs text-text-muted">{item.description}</p>
                        )}
                        {item.validity_months && (
                          <p className="mt-1 text-[11px] text-text-muted">
                            Valid for {item.validity_months} months
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Completions tab */}
      {activeTab === 'completions' && (
        <div className="space-y-2">
          {completions.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-12 text-center text-sm text-text-muted">
              No training completions recorded yet.
            </div>
          ) : (
            completions.map((comp) => {
              const training = catalog.find((c) => c.id === comp.training_id);
              const colors = COMPLETION_STATUS_COLORS[comp.status];
              const StatusIcon = comp.status === 'active' ? CheckCircle2
                : comp.status === 'expired' ? XCircle
                : comp.status === 'pending_verification' ? Clock
                : AlertTriangle;

              return (
                <div
                  key={comp.id}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3"
                >
                  <StatusIcon size={16} className={colors.text} />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-text-primary">
                      {training?.name ?? 'Unknown Training'}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn(
                        'inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase border',
                        colors.bg, colors.border, colors.text,
                      )}>
                        {comp.status.replace('_', ' ')}
                      </span>
                      <span className="text-[11px] text-text-muted">
                        Completed {new Date(comp.completed_at).toLocaleDateString()}
                      </span>
                      {comp.expires_at && (
                        <span className="text-[11px] text-text-muted">
                          · Expires {new Date(comp.expires_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {comp.status === 'pending_verification' && (
                    <button
                      onClick={() => verifyCompletion(comp.id)}
                      className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 transition-colors"
                    >
                      Verify
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default TrainingAdminPage;
