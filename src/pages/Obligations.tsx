import { useEffect, useState, useMemo } from 'react';
import { ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';
import type { Obligation, PenaltyTier } from '@/types/obligations';

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue';
type TierFilter = 'all' | 'current' | 'tier1' | 'tier2' | 'tier3';

/** Map server tier format (tier_1) to style keys (tier1) */
function tierStyleKey(tier: PenaltyTier): string {
  return tier === 'none' ? 'current' : tier.replace('_', '');
}

/** Map TierFilter back to server format for comparison */
function filterToServerTier(filter: TierFilter): PenaltyTier | null {
  switch (filter) {
    case 'current': return 'none';
    case 'tier1': return 'tier_1';
    case 'tier2': return 'tier_2';
    case 'tier3': return 'tier_3';
    default: return null;
  }
}

export function Obligations() {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from('consent_decree_obligations')
        .select('*')
        .order('next_due_date', { ascending: true });

      if (error || !data) {
        console.error('[obligations] Failed to fetch:', error?.message);
        setLoading(false);
        return;
      }

      setObligations(data as unknown as Obligation[]);
      setLoading(false);
    }

    fetch();
  }, []);

  const filtered = useMemo(() => {
    const serverTier = filterToServerTier(tierFilter);
    return obligations.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (serverTier !== null && o.penalty_tier !== serverTier) return false;
      return true;
    });
  }, [obligations, statusFilter, tierFilter]);

  const summary = useMemo(() => {
    let overdue = 0;
    let dueThisWeek = 0;
    let totalPenalties = 0;
    const now = new Date();

    for (const o of obligations) {
      if (o.days_at_risk > 0 && o.status !== 'completed') {
        overdue++;
        totalPenalties += o.accrued_penalty ?? 0;
      }
      if (o.next_due_date) {
        const due = new Date(o.next_due_date);
        const daysUntil = Math.floor((due.getTime() - now.getTime()) / 86_400_000);
        if (daysUntil >= 0 && daysUntil <= 7 && o.status !== 'completed') dueThisWeek++;
      }
    }

    return { total: obligations.length, overdue, dueThisWeek, totalPenalties };
  }, [obligations]);

  const tierRowStyles: Record<string, string> = {
    current: '',
    tier1: 'bg-yellow-500/[0.04] border-l-2 border-l-yellow-500/50',
    tier2: 'bg-orange-500/[0.04] border-l-2 border-l-orange-500/50',
    tier3: 'bg-red-500/[0.06] border-l-2 border-l-red-500/50',
  };

  const tierBadgeStyles: Record<string, string> = {
    current: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    tier1: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    tier2: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    tier3: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  /** Per-type daily rate label for expanded details */
  function getDailyRate(o: Obligation): string {
    const tier = o.penalty_tier;
    const type = o.obligation_type ?? '';
    const isBase = ['ems_audit', 'treatment_inspection', 'database_maintenance'].includes(type);
    if (tier === 'tier_1') return isBase ? '$1,000' : '$250';
    if (tier === 'tier_2') return isBase ? '$2,500' : '$500';
    if (tier === 'tier_3') return isBase ? '$4,500' : '$1,250';
    return '$0';
  }

  return (
    <div className="mx-auto max-w-[1920px] space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            Consent Decree Obligations
          </h1>
          <p className="text-sm text-text-secondary">
            Paragraph-by-paragraph tracking — Case 7:16-cv-00462-GEC
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.05] p-2.5">
          <ClipboardList className="h-6 w-6 text-purple-400" />
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatBadge label="Total Obligations" value={summary.total} color="text-text-primary" />
        <StatBadge label="Overdue" value={summary.overdue} color="text-red-400" />
        <StatBadge label="Due This Week" value={summary.dueThisWeek} color="text-yellow-400" />
        <StatBadge
          label="Accrued Penalties"
          value={`$${summary.totalPenalties.toLocaleString()}`}
          color="text-orange-400"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: 'all', label: 'All Statuses' },
            { value: 'pending', label: 'Pending' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'completed', label: 'Completed' },
            { value: 'overdue', label: 'Overdue' },
          ]}
        />
        <FilterSelect
          label="Tier"
          value={tierFilter}
          onChange={(v) => setTierFilter(v as TierFilter)}
          options={[
            { value: 'all', label: 'All Tiers' },
            { value: 'current', label: 'Current' },
            { value: 'tier1', label: 'Tier 1 (1–14d)' },
            { value: 'tier2', label: 'Tier 2 (15–30d)' },
            { value: 'tier3', label: 'Tier 3 (31+d)' },
          ]}
        />
        <span className="text-xs text-text-muted">
          Showing {filtered.length} of {obligations.length}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.06]">
        {/* Header Row */}
        <div className="grid grid-cols-[80px_1fr_120px_120px_100px_100px_120px] gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs font-medium uppercase text-text-muted">
          <div>CD &para;</div>
          <div>Obligation</div>
          <div>Type</div>
          <div>Due Date</div>
          <div>Status</div>
          <div>Days Late</div>
          <div className="text-right">Accrued $</div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-text-muted">
            No obligations match the current filters.
          </div>
        ) : (
          filtered.map((o) => {
            const styleKey = tierStyleKey(o.penalty_tier);
            const isExpanded = expandedId === o.id;

            return (
              <div key={o.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : o.id)}
                  className={cn(
                    'grid w-full grid-cols-[80px_1fr_120px_120px_100px_100px_120px] items-center gap-3 border-b border-white/[0.04] px-4 py-3 text-left text-sm transition-colors hover:bg-white/[0.03]',
                    tierRowStyles[styleKey],
                  )}
                >
                  <div className="font-mono text-xs text-text-muted">
                    {o.paragraph_number ?? '—'}
                  </div>
                  <div className="truncate text-text-primary">{o.description}</div>
                  <div className="text-xs text-text-secondary">{o.obligation_type ?? '—'}</div>
                  <div className="text-xs text-text-secondary">
                    {o.next_due_date ? new Date(o.next_due_date).toLocaleDateString() : '—'}
                  </div>
                  <div>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        o.status === 'completed'
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                          : o.status === 'overdue'
                            ? 'border-red-500/20 bg-red-500/10 text-red-400'
                            : 'border-white/10 bg-white/5 text-text-secondary',
                      )}
                    >
                      {o.status}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'text-xs font-medium',
                      o.days_at_risk > 0 ? 'text-red-400' : 'text-text-muted',
                    )}
                  >
                    {o.days_at_risk > 0 ? o.days_at_risk : '—'}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {o.accrued_penalty > 0 && (
                      <span
                        className={cn(
                          'rounded border px-1.5 py-0.5 text-[10px] font-bold',
                          tierBadgeStyles[styleKey],
                        )}
                      >
                        ${o.accrued_penalty.toLocaleString()}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5 text-text-muted" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
                    )}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-b border-white/[0.06] bg-white/[0.02] px-6 py-4">
                    <div className="grid grid-cols-2 gap-6 text-sm lg:grid-cols-3">
                      <div>
                        <div className="mb-1 text-xs font-medium uppercase text-text-muted">
                          Description
                        </div>
                        <div className="text-text-secondary">{o.description}</div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-medium uppercase text-text-muted">
                          Penalty Tier
                        </div>
                        <div className={cn('font-medium', tierBadgeStyles[styleKey]?.split(' ')[1])}>
                          {o.penalty_tier === 'none'
                            ? 'Current (no penalty)'
                            : `${styleKey.replace('tier', 'Tier ')} — ${getDailyRate(o)}/day`}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-medium uppercase text-text-muted">
                          Responsible Role
                        </div>
                        <div className="text-text-secondary">
                          {o.responsible_role ?? '—'}
                        </div>
                      </div>
                      {o.notes && (
                        <div className="col-span-full">
                          <div className="mb-1 text-xs font-medium uppercase text-text-muted">
                            Notes
                          </div>
                          <div className="text-text-secondary">{o.notes}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={cn('mt-1 text-2xl font-bold', color)}>{value}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="rounded-lg border border-white/[0.08] bg-crystal-surface px-3 py-2 text-sm text-text-secondary outline-none transition-colors hover:border-white/[0.12] focus:border-white/[0.16]"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
