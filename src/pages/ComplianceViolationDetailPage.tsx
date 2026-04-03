import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useComplianceViolations } from '@/hooks/useComplianceViolations';
import { useHumanOverrides } from '@/hooks/useHumanOverrides';
import {
  ArrowLeft,
  ShieldAlert,
  Shield,
  FileText,
  Gavel,
  Plus,
  AlertTriangle,
  CheckCircle2,
  History,
} from 'lucide-react';
import { clsx } from 'clsx';
import type {
  ViolationStatus,
  ViolationType,
  ViolationSeverity,
  NOVRecord,
  EnforcementAction,
  NOVResponseStatus,
  EnforcementActionType,
} from '@/types/database';

const STATUS_LABELS: Record<ViolationStatus, string> = {
  open: 'Open',
  under_investigation: 'Under Investigation',
  reported: 'Reported',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_COLORS: Record<ViolationStatus, string> = {
  open: 'bg-red-500/20 text-red-300 border-red-500/30',
  under_investigation: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  reported: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  resolved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  closed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const TYPE_LABELS: Record<ViolationType, string> = {
  permit_exceedance: 'Permit Exceedance',
  reporting_failure: 'Reporting Failure',
  monitoring_failure: 'Monitoring Failure',
  discharge_violation: 'Discharge Violation',
  bmp_failure: 'BMP Failure',
  consent_decree_violation: 'Consent Decree Violation',
  spill: 'Spill',
  unauthorized_discharge: 'Unauthorized Discharge',
  recordkeeping: 'Recordkeeping',
  other: 'Other',
};

const SEVERITY_COLORS: Record<ViolationSeverity, string> = {
  minor: 'bg-gray-500/20 text-gray-300',
  moderate: 'bg-amber-500/20 text-amber-300',
  major: 'bg-orange-500/20 text-orange-300',
  critical: 'bg-red-500/20 text-red-300',
};

const RESPONSE_STATUS_LABELS: Record<NOVResponseStatus, string> = {
  pending: 'Pending',
  drafting: 'Drafting',
  under_review: 'Under Review',
  submitted: 'Submitted',
  accepted: 'Accepted',
  appealed: 'Appealed',
};

const ENFORCEMENT_TYPE_LABELS: Record<EnforcementActionType, string> = {
  administrative_order: 'Administrative Order',
  consent_order: 'Consent Order',
  compliance_schedule: 'Compliance Schedule',
  penalty_assessment: 'Penalty Assessment',
  injunctive_relief: 'Injunctive Relief',
  supplemental_environmental_project: 'SEP',
  criminal_referral: 'Criminal Referral',
  other: 'Other',
};

const NEXT_STATUS: Partial<Record<ViolationStatus, ViolationStatus[]>> = {
  open: ['under_investigation', 'reported'],
  under_investigation: ['reported', 'resolved'],
  reported: ['resolved', 'closed'],
  resolved: ['closed'],
};

export function ComplianceViolationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const {
    violations,
    loading,
    updateViolationStatus,
    fetchNOVs,
    createNOV,
    fetchEnforcements,
    createEnforcement,
  } = useComplianceViolations();
  const { hasActiveHold, getOverridesForEntity, placeLegalHold, legalHolds } = useHumanOverrides();

  const [novs, setNovs] = useState<NOVRecord[]>([]);
  const [enforcements, setEnforcements] = useState<EnforcementAction[]>([]);
  const [showNOVForm, setShowNOVForm] = useState(false);
  const [showEnforcementForm, setShowEnforcementForm] = useState(false);
  const [showHoldForm, setShowHoldForm] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [holdReason, setHoldReason] = useState('');

  // NOV form state
  const [novNumber, setNovNumber] = useState('');
  const [novAgency, setNovAgency] = useState('');
  const [novIssuedDate, setNovIssuedDate] = useState('');
  const [novResponseDue, setNovResponseDue] = useState('');
  const [novDescription, setNovDescription] = useState('');
  const [novPenalty, setNovPenalty] = useState('');

  // Enforcement form state
  const [enfType, setEnfType] = useState<EnforcementActionType>('administrative_order');
  const [enfAgency, setEnfAgency] = useState('');
  const [enfIssuedDate, setEnfIssuedDate] = useState('');
  const [enfPenalty, setEnfPenalty] = useState('');
  const [enfDescription, setEnfDescription] = useState('');

  const violation = violations.find((v) => v.id === id);
  const isHeld = id ? hasActiveHold('violation', id) : false;
  const overrides = id ? getOverridesForEntity('violation', id) : [];
  const activeHold = legalHolds.find(
    (h) => h.entity_type === 'violation' && h.entity_id === id && h.is_active,
  );

  const loadRelated = useCallback(async () => {
    if (!id) return;
    const [novData, enfData] = await Promise.all([
      fetchNOVs(id),
      fetchEnforcements(id),
    ]);
    setNovs(novData);
    setEnforcements(enfData);
  }, [id, fetchNOVs, fetchEnforcements]);

  useEffect(() => {
    loadRelated();
  }, [loadRelated]);

  const handleStatusChange = async (newStatus: ViolationStatus) => {
    if (!id || isHeld) return;
    await updateViolationStatus(id, newStatus, resolutionNotes || undefined);
    setResolutionNotes('');
  };

  const handleCreateNOV = async () => {
    if (!id || !novAgency.trim() || !novIssuedDate) return;
    await createNOV({
      violation_id: id,
      nov_number: novNumber.trim() || null,
      issuing_agency: novAgency.trim(),
      issued_date: novIssuedDate,
      response_due_date: novResponseDue || null,
      description: novDescription.trim() || null,
      proposed_penalty: novPenalty ? parseFloat(novPenalty) : null,
    });
    setShowNOVForm(false);
    setNovNumber('');
    setNovAgency('');
    setNovIssuedDate('');
    setNovResponseDue('');
    setNovDescription('');
    setNovPenalty('');
    loadRelated();
  };

  const handleCreateEnforcement = async () => {
    if (!id || !enfAgency.trim() || !enfIssuedDate) return;
    await createEnforcement({
      violation_id: id,
      action_type: enfType,
      issuing_agency: enfAgency.trim(),
      issued_date: enfIssuedDate,
      penalty_amount: enfPenalty ? parseFloat(enfPenalty) : null,
      description: enfDescription.trim() || null,
    });
    setShowEnforcementForm(false);
    setEnfType('administrative_order');
    setEnfAgency('');
    setEnfIssuedDate('');
    setEnfPenalty('');
    setEnfDescription('');
    loadRelated();
  };

  const handlePlaceHold = async () => {
    if (!id || !holdReason.trim()) return;
    await placeLegalHold({
      entity_type: 'violation',
      entity_id: id,
      hold_reason: holdReason.trim(),
    });
    setHoldReason('');
    setShowHoldForm(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-red-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!violation) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">Violation not found</p>
        <Link to="/compliance/violations" className="text-red-400 hover:underline mt-2 inline-block">
          Back to Violations
        </Link>
      </div>
    );
  }

  const nextStatuses = NEXT_STATUS[violation.status] ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/compliance/violations"
          className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
        >
          <ArrowLeft className="w-4 h-4 text-text-secondary" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">
              {TYPE_LABELS[violation.violation_type]}
            </h1>
            {isHeld && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-medium">
                <Shield className="w-3 h-3" />
                Legal Hold
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-text-secondary">
            <span className={clsx('px-2 py-0.5 rounded text-xs font-medium border', STATUS_COLORS[violation.status])}>
              {STATUS_LABELS[violation.status]}
            </span>
            <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', SEVERITY_COLORS[violation.severity])}>
              {violation.severity}
            </span>
            <span>Date: {violation.violation_date}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description & Details */}
          <SpotlightCard className="p-4 space-y-3">
            {violation.description && (
              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-1">Description</h3>
                <p className="text-white whitespace-pre-wrap">{violation.description}</p>
              </div>
            )}
            {violation.exceedance_pct && (
              <div className="flex items-center gap-2 text-red-300">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">
                  Measured: {violation.measured_value} {violation.unit} | Limit: {violation.limit_value} {violation.unit} | Exceedance: {violation.exceedance_pct.toFixed(1)}%
                </span>
              </div>
            )}
            {violation.root_cause && (
              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-1">Root Cause</h3>
                <p className="text-white text-sm">{violation.root_cause}</p>
                {violation.root_cause_category && (
                  <span className="text-xs text-text-secondary capitalize mt-1 inline-block">
                    Category: {violation.root_cause_category.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            )}
          </SpotlightCard>

          {/* Status Transition */}
          {nextStatuses.length > 0 && !isHeld && (
            <SpotlightCard className="p-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">Update Status</h3>
              <div className="space-y-3">
                <input
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-text-secondary focus:border-red-500/50 focus:outline-none"
                  placeholder="Resolution notes..."
                />
                <div className="flex flex-wrap gap-2">
                  {nextStatuses.map((ns) => (
                    <button
                      key={ns}
                      onClick={() => handleStatusChange(ns)}
                      className={clsx(
                        'px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors hover:opacity-80',
                        STATUS_COLORS[ns],
                      )}
                    >
                      {STATUS_LABELS[ns]}
                    </button>
                  ))}
                </div>
              </div>
            </SpotlightCard>
          )}

          {isHeld && (
            <SpotlightCard className="p-4 border-red-500/30">
              <div className="flex items-center gap-2 text-red-300">
                <Shield className="w-5 h-5" />
                <span className="font-medium">Legal Hold Active</span>
              </div>
              <p className="text-sm text-text-secondary mt-1">{activeHold?.hold_reason}</p>
            </SpotlightCard>
          )}

          {/* NOVs Section */}
          <SpotlightCard className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-medium text-white">Notices of Violation ({novs.length})</h3>
              </div>
              <button
                onClick={() => setShowNOVForm(!showNOVForm)}
                className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
              >
                <Plus className="w-3 h-3" />
                Add NOV
              </button>
            </div>

            {showNOVForm && (
              <div className="mb-4 p-3 bg-white/[0.02] rounded-lg border border-white/5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={novNumber}
                    onChange={(e) => setNovNumber(e.target.value)}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-text-secondary focus:outline-none"
                    placeholder="NOV Number"
                  />
                  <input
                    value={novAgency}
                    onChange={(e) => setNovAgency(e.target.value)}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-text-secondary focus:outline-none"
                    placeholder="Issuing Agency *"
                  />
                  <input
                    type="date"
                    value={novIssuedDate}
                    onChange={(e) => setNovIssuedDate(e.target.value)}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none"
                  />
                  <input
                    type="date"
                    value={novResponseDue}
                    onChange={(e) => setNovResponseDue(e.target.value)}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none"
                    placeholder="Response Due"
                  />
                  <input
                    value={novPenalty}
                    onChange={(e) => setNovPenalty(e.target.value)}
                    type="number"
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-text-secondary focus:outline-none"
                    placeholder="Proposed Penalty ($)"
                  />
                </div>
                <textarea
                  value={novDescription}
                  onChange={(e) => setNovDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-text-secondary focus:outline-none resize-none"
                  placeholder="Alleged violations..."
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowNOVForm(false)} className="text-xs text-text-secondary hover:text-white px-3 py-1.5">Cancel</button>
                  <button
                    onClick={handleCreateNOV}
                    disabled={!novAgency.trim() || !novIssuedDate}
                    className="px-3 py-1.5 text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded hover:bg-amber-500/30 disabled:opacity-40"
                  >
                    Add NOV
                  </button>
                </div>
              </div>
            )}

            {novs.length === 0 ? (
              <p className="text-sm text-text-secondary">No NOVs recorded</p>
            ) : (
              <div className="space-y-2">
                {novs.map((nov) => {
                  const isResponseOverdue =
                    nov.response_due_date &&
                    new Date(nov.response_due_date) < new Date() &&
                    !['submitted', 'accepted'].includes(nov.response_status);
                  return (
                    <div key={nov.id} className="p-3 bg-white/[0.02] rounded-lg border border-white/5">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm text-white font-medium">
                            {nov.nov_number ?? 'NOV'} — {nov.issuing_agency}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-text-secondary mt-1">
                            <span>Issued: {nov.issued_date}</span>
                            {nov.response_due_date && (
                              <span className={clsx(isResponseOverdue && 'text-red-400')}>
                                {isResponseOverdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                                Response due: {nov.response_due_date}
                              </span>
                            )}
                            {nov.proposed_penalty && (
                              <span className="text-amber-400">${nov.proposed_penalty.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-text-secondary capitalize">
                          {RESPONSE_STATUS_LABELS[nov.response_status]}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SpotlightCard>

          {/* Enforcement Actions */}
          <SpotlightCard className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Gavel className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-medium text-white">Enforcement Actions ({enforcements.length})</h3>
              </div>
              <button
                onClick={() => setShowEnforcementForm(!showEnforcementForm)}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
              >
                <Plus className="w-3 h-3" />
                Add Action
              </button>
            </div>

            {showEnforcementForm && (
              <div className="mb-4 p-3 bg-white/[0.02] rounded-lg border border-white/5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={enfType}
                    onChange={(e) => setEnfType(e.target.value as EnforcementActionType)}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none"
                  >
                    {Object.entries(ENFORCEMENT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <input
                    value={enfAgency}
                    onChange={(e) => setEnfAgency(e.target.value)}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-text-secondary focus:outline-none"
                    placeholder="Issuing Agency *"
                  />
                  <input
                    type="date"
                    value={enfIssuedDate}
                    onChange={(e) => setEnfIssuedDate(e.target.value)}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none"
                  />
                  <input
                    value={enfPenalty}
                    onChange={(e) => setEnfPenalty(e.target.value)}
                    type="number"
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-text-secondary focus:outline-none"
                    placeholder="Penalty Amount ($)"
                  />
                </div>
                <textarea
                  value={enfDescription}
                  onChange={(e) => setEnfDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-text-secondary focus:outline-none resize-none"
                  placeholder="Action requirements..."
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowEnforcementForm(false)} className="text-xs text-text-secondary hover:text-white px-3 py-1.5">Cancel</button>
                  <button
                    onClick={handleCreateEnforcement}
                    disabled={!enfAgency.trim() || !enfIssuedDate}
                    className="px-3 py-1.5 text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30 rounded hover:bg-red-500/30 disabled:opacity-40"
                  >
                    Add Action
                  </button>
                </div>
              </div>
            )}

            {enforcements.length === 0 ? (
              <p className="text-sm text-text-secondary">No enforcement actions</p>
            ) : (
              <div className="space-y-2">
                {enforcements.map((ea) => (
                  <div key={ea.id} className="p-3 bg-white/[0.02] rounded-lg border border-white/5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-white font-medium">
                          {ENFORCEMENT_TYPE_LABELS[ea.action_type]} — {ea.issuing_agency}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-text-secondary mt-1">
                          <span>Issued: {ea.issued_date}</span>
                          {ea.compliance_deadline && <span>Deadline: {ea.compliance_deadline}</span>}
                          {ea.penalty_amount && (
                            <span className="text-red-400">${ea.penalty_amount.toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-text-secondary capitalize">
                        {ea.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SpotlightCard>

          {/* Override History */}
          {overrides.length > 0 && (
            <SpotlightCard className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-medium text-white">Override History ({overrides.length})</h3>
              </div>
              <div className="space-y-2">
                {overrides.map((o) => (
                  <div key={o.id} className="p-3 bg-white/[0.02] rounded-lg border border-white/5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-text-secondary">{o.field_name}:</span>
                      <span className="text-red-300 line-through">{o.original_value}</span>
                      <span className="text-text-secondary">→</span>
                      <span className="text-emerald-300">{o.override_value}</span>
                    </div>
                    <p className="text-xs text-text-secondary mt-1">Reason: {o.reason}</p>
                    <div className="flex items-center gap-2 text-xs text-text-secondary mt-1">
                      <span>{new Date(o.created_at).toLocaleDateString()}</span>
                      {o.approved_at && (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" />
                          Approved
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </SpotlightCard>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Details */}
          <SpotlightCard className="p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3">Details</h3>
            <dl className="space-y-2 text-sm">
              {violation.site_name && (
                <>
                  <dt className="text-text-secondary">Site</dt>
                  <dd className="text-white">{violation.site_name}</dd>
                </>
              )}
              {violation.permit_number && (
                <>
                  <dt className="text-text-secondary">Permit</dt>
                  <dd className="text-white">{violation.permit_number}</dd>
                </>
              )}
              {violation.parameter_name && (
                <>
                  <dt className="text-text-secondary">Parameter</dt>
                  <dd className="text-white">{violation.parameter_name}</dd>
                </>
              )}
              {violation.regulatory_agency && (
                <>
                  <dt className="text-text-secondary">Agency</dt>
                  <dd className="text-white">{violation.regulatory_agency}</dd>
                </>
              )}
              {violation.state_code && (
                <>
                  <dt className="text-text-secondary">State</dt>
                  <dd className="text-white">{violation.state_code}</dd>
                </>
              )}
              {(violation.actual_penalty ?? violation.estimated_penalty) && (
                <>
                  <dt className="text-text-secondary">Penalty</dt>
                  <dd className="text-amber-300">
                    ${(violation.actual_penalty ?? violation.estimated_penalty ?? 0).toLocaleString()}
                    {!violation.actual_penalty && violation.estimated_penalty && ' (est.)'}
                  </dd>
                </>
              )}
              {violation.decree_paragraphs && violation.decree_paragraphs.length > 0 && (
                <>
                  <dt className="text-text-secondary">Decree Paragraphs</dt>
                  <dd className="text-white">{violation.decree_paragraphs.join(', ')}</dd>
                </>
              )}
              <dt className="text-text-secondary">Discovered</dt>
              <dd className="text-white">{violation.discovery_date ?? violation.violation_date}</dd>
              <dt className="text-text-secondary">Created</dt>
              <dd className="text-white">{new Date(violation.created_at).toLocaleDateString()}</dd>
            </dl>
          </SpotlightCard>

          {/* Linked Records */}
          <SpotlightCard className="p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3">Linked Records</h3>
            <div className="space-y-2 text-sm">
              {violation.exceedance_id && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-text-secondary">Exceedance linked</span>
                </div>
              )}
              {violation.incident_id && (
                <Link
                  to={`/incidents/${violation.incident_id}`}
                  className="flex items-center gap-2 text-cyan-400 hover:underline"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  View Incident
                </Link>
              )}
              {violation.corrective_action_id && (
                <Link
                  to={`/corrective-actions/${violation.corrective_action_id}`}
                  className="flex items-center gap-2 text-cyan-400 hover:underline"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  View Corrective Action
                </Link>
              )}
            </div>
          </SpotlightCard>

          {/* Legal Hold */}
          <SpotlightCard className="p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3">Legal Hold</h3>
            {isHeld ? (
              <div className="text-sm">
                <div className="flex items-center gap-1 text-red-300">
                  <Shield className="w-4 h-4" />
                  Active hold
                </div>
                {activeHold && (
                  <p className="text-xs text-text-secondary mt-1">{activeHold.hold_reason}</p>
                )}
              </div>
            ) : showHoldForm ? (
              <div className="space-y-2">
                <textarea
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-text-secondary focus:border-red-500/50 focus:outline-none resize-none"
                  placeholder="Reason for legal hold..."
                />
                <div className="flex gap-2">
                  <button
                    onClick={handlePlaceHold}
                    disabled={!holdReason.trim()}
                    className="px-3 py-1.5 text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30 rounded hover:bg-red-500/30 disabled:opacity-40"
                  >
                    Place Hold
                  </button>
                  <button onClick={() => setShowHoldForm(false)} className="px-3 py-1.5 text-xs text-text-secondary hover:text-white">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowHoldForm(true)}
                className="text-sm text-text-secondary hover:text-red-300 transition-colors"
              >
                Place legal hold...
              </button>
            )}
          </SpotlightCard>

          {/* Summary Stats */}
          <SpotlightCard className="p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-3">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">NOVs</span>
                <span className="text-white">{novs.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Enforcement Actions</span>
                <span className="text-white">{enforcements.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Overrides</span>
                <span className="text-white">{overrides.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Days Open</span>
                <span className="text-white">
                  {Math.floor(
                    (new Date().getTime() - new Date(violation.violation_date).getTime()) / (1000 * 60 * 60 * 24),
                  )}
                </span>
              </div>
            </div>
          </SpotlightCard>
        </div>
      </div>
    </div>
  );
}

export default ComplianceViolationDetailPage;
