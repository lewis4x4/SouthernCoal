import { useState, useEffect, useCallback } from 'react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useDocumentCompleteness } from '@/hooks/useDocumentCompleteness';
import { supabase } from '@/lib/supabase';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  Scale,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Filter,
} from 'lucide-react';
import { clsx } from 'clsx';
import type {
  EvidenceType,
  EvidenceVerificationStatus,
} from '@/types/database';

interface Obligation {
  id: string;
  paragraph_number: string;
  title: string;
  status: string;
}

const VERIFICATION_ICONS: Record<EvidenceVerificationStatus, typeof Clock> = {
  unverified: HelpCircle,
  verified: CheckCircle2,
  expired: AlertTriangle,
  insufficient: XCircle,
  disputed: XCircle,
};

const VERIFICATION_COLORS: Record<EvidenceVerificationStatus, string> = {
  unverified: 'text-gray-400',
  verified: 'text-emerald-400',
  expired: 'text-red-400',
  insufficient: 'text-amber-400',
  disputed: 'text-red-400',
};

const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  document: 'Document',
  record: 'Record',
  report: 'Report',
  photo: 'Photo',
  certification: 'Certification',
  training_completion: 'Training',
  inspection_report: 'Inspection',
  lab_result: 'Lab Result',
  dmr_submission: 'DMR',
  corrective_action: 'Corrective Action',
  other: 'Other',
};

export function ObligationEvidencePage() {
  const { profile } = useUserProfile();
  const orgId = profile?.organization_id ?? null;
  const { evidence, addEvidence, updateEvidenceStatus, loading } = useDocumentCompleteness();

  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [selectedObligation, setSelectedObligation] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'covered' | 'uncovered'>('all');

  // Evidence form
  const [evTitle, setEvTitle] = useState('');
  const [evType, setEvType] = useState<EvidenceType>('document');
  const [evDescription, setEvDescription] = useState('');

  // Fetch obligations
  const fetchObligations = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('consent_decree_obligations')
      .select('id, paragraph_number, title, status')
      .eq('organization_id', orgId)
      .order('paragraph_number');

    if (error) {
      console.error('[obligations] fetch error:', error.message);
    } else {
      setObligations((data ?? []) as Obligation[]);
    }
  }, [orgId]);

  useEffect(() => {
    fetchObligations();
  }, [fetchObligations]);

  // Compute coverage
  const obligationsWithCoverage = obligations.map((ob) => {
    const obEvidence = evidence.filter((e) => e.obligation_id === ob.id);
    const hasVerified = obEvidence.some((e) => e.verification_status === 'verified');
    const hasAny = obEvidence.length > 0;
    return { ...ob, evidence: obEvidence, hasVerified, hasAny };
  });

  const filtered = obligationsWithCoverage.filter((ob) => {
    if (statusFilter === 'covered') return ob.hasVerified;
    if (statusFilter === 'uncovered') return !ob.hasVerified;
    return true;
  });

  const coveredCount = obligationsWithCoverage.filter((o) => o.hasVerified).length;
  const totalActive = obligationsWithCoverage.filter((o) => o.status === 'active').length;

  const handleAddEvidence = async () => {
    if (!selectedObligation || !evTitle.trim()) return;
    await addEvidence({
      obligation_id: selectedObligation,
      evidence_type: evType,
      title: evTitle.trim(),
      description: evDescription.trim() || undefined,
    });
    setEvTitle('');
    setEvDescription('');
    setShowAddForm(false);
  };

  const selectedObEvidence = selectedObligation
    ? evidence.filter((e) => e.obligation_id === selectedObligation)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/20">
            <Scale className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Obligation Evidence</h1>
            <p className="text-sm text-text-secondary">
              Map consent decree obligations to supporting evidence
            </p>
          </div>
        </div>
      </div>

      {/* Coverage Summary */}
      <div className="grid grid-cols-3 gap-4">
        <SpotlightCard className="p-4 text-center">
          <div className="text-2xl font-bold text-white">{obligations.length}</div>
          <div className="text-xs text-text-secondary">Total Obligations</div>
        </SpotlightCard>
        <SpotlightCard className="p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{coveredCount}</div>
          <div className="text-xs text-text-secondary">Verified Evidence</div>
        </SpotlightCard>
        <SpotlightCard className="p-4 text-center">
          <div className={clsx(
            'text-2xl font-bold',
            totalActive - coveredCount > 0 ? 'text-amber-400' : 'text-emerald-400',
          )}>
            {totalActive - coveredCount}
          </div>
          <div className="text-xs text-text-secondary">Gaps</div>
        </SpotlightCard>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-text-secondary" />
        {[
          { key: 'all' as const, label: 'All' },
          { key: 'covered' as const, label: 'Covered' },
          { key: 'uncovered' as const, label: 'Gaps' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={clsx(
              'px-3 py-1 text-xs rounded-lg border transition-colors',
              statusFilter === key
                ? 'bg-white/10 border-white/20 text-white'
                : 'border-transparent text-text-secondary hover:text-white',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-violet-400 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Obligations List */}
          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {filtered.map((ob) => (
              <button
                key={ob.id}
                onClick={() => {
                  setSelectedObligation(ob.id);
                  setShowAddForm(false);
                }}
                className={clsx(
                  'w-full text-left p-3 rounded-lg border transition-colors',
                  selectedObligation === ob.id
                    ? 'bg-white/10 border-white/20'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/5',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-violet-400">{ob.paragraph_number}</span>
                      <span className="text-sm text-white truncate">{ob.title}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    {ob.hasVerified ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : ob.hasAny ? (
                      <Clock className="w-4 h-4 text-amber-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-xs text-text-secondary">{ob.evidence.length}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Evidence Detail */}
          <div>
            {selectedObligation ? (
              <SpotlightCard className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-white">
                    Evidence for §{obligationsWithCoverage.find((o) => o.id === selectedObligation)?.paragraph_number}
                  </h3>
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
                  >
                    <Plus className="w-3 h-3" />
                    Add Evidence
                  </button>
                </div>

                {showAddForm && (
                  <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5 space-y-2">
                    <input
                      value={evTitle}
                      onChange={(e) => setEvTitle(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white placeholder:text-text-secondary focus:outline-none"
                      placeholder="Evidence title *"
                    />
                    <select
                      value={evType}
                      onChange={(e) => setEvType(e.target.value as EvidenceType)}
                      className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white focus:outline-none"
                    >
                      {Object.entries(EVIDENCE_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <textarea
                      value={evDescription}
                      onChange={(e) => setEvDescription(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white placeholder:text-text-secondary focus:outline-none resize-none"
                      placeholder="Description..."
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowAddForm(false)} className="text-xs text-text-secondary px-3 py-1">Cancel</button>
                      <button
                        onClick={handleAddEvidence}
                        disabled={!evTitle.trim()}
                        className="px-3 py-1 text-xs font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded hover:bg-violet-500/30 disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                {selectedObEvidence.length === 0 ? (
                  <p className="text-sm text-text-secondary py-4 text-center">No evidence linked yet</p>
                ) : (
                  <div className="space-y-2">
                    {selectedObEvidence.map((ev) => {
                      const VIcon = VERIFICATION_ICONS[ev.verification_status];
                      return (
                        <div key={ev.id} className="p-3 bg-white/[0.02] rounded-lg border border-white/5">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <VIcon className={clsx('w-4 h-4', VERIFICATION_COLORS[ev.verification_status])} />
                              <span className="text-sm text-white">{ev.title}</span>
                            </div>
                            <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-text-secondary">
                              {EVIDENCE_TYPE_LABELS[ev.evidence_type]}
                            </span>
                          </div>
                          {ev.description && (
                            <p className="text-xs text-text-secondary mb-2">{ev.description}</p>
                          )}
                          <div className="flex items-center gap-2">
                            {(['verified', 'expired', 'insufficient', 'disputed'] as EvidenceVerificationStatus[]).map((s) => (
                              <button
                                key={s}
                                onClick={() => updateEvidenceStatus(ev.id, s)}
                                className={clsx(
                                  'px-2 py-0.5 text-xs rounded capitalize',
                                  ev.verification_status === s
                                    ? 'bg-white/10 text-white'
                                    : 'text-text-secondary hover:text-white',
                                )}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                          {ev.expiry_date && (
                            <div className={clsx(
                              'text-xs mt-1',
                              new Date(ev.expiry_date) < new Date() ? 'text-red-400' : 'text-text-secondary',
                            )}>
                              Expires: {ev.expiry_date}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </SpotlightCard>
            ) : (
              <SpotlightCard className="p-12 text-center">
                <Scale className="w-8 h-8 text-text-secondary mx-auto mb-3" />
                <p className="text-text-secondary">Select an obligation to view or add evidence</p>
              </SpotlightCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ObligationEvidencePage;
