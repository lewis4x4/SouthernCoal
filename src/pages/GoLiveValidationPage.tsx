import { useState } from 'react';
import {
  Rocket, Plus, CheckCircle2, XCircle, AlertTriangle, Clock,
  ChevronRight, Shield, FileText, Zap, X, Pen,
} from 'lucide-react';
import { SpotlightCard } from '@/components/ui/SpotlightCard';
import { useGoLiveValidation, MODULE_LABELS, STAGE_LABELS, SIGN_OFF_LABELS } from '@/hooks/useGoLiveValidation';
import { useAuditLog } from '@/hooks/useAuditLog';
import type {
  GoLiveItemStatus,
  GoLiveItemModule,
  GoLiveChecklistItem,
  DeploymentStage,
  DeploymentStageStatus,
  SignOffType,
  SmokeTestType,
} from '@/types/database';

type Tab = 'checklist' | 'deploy' | 'smoke' | 'signoff';

const STATUS_CYCLE: GoLiveItemStatus[] = ['pending', 'in_progress', 'passed', 'failed', 'blocked', 'na'];

const ITEM_STATUS_STYLE: Record<GoLiveItemStatus, { bg: string; text: string; label: string }> = {
  pending:     { bg: 'bg-white/5',        text: 'text-text-secondary', label: 'Pending' },
  in_progress: { bg: 'bg-cyan-500/15',    text: 'text-cyan-300',       label: 'In Progress' },
  passed:      { bg: 'bg-green-500/15',   text: 'text-green-300',      label: 'Passed' },
  failed:      { bg: 'bg-red-500/15',     text: 'text-red-300',        label: 'Failed' },
  blocked:     { bg: 'bg-amber-500/15',   text: 'text-amber-300',      label: 'Blocked' },
  na:          { bg: 'bg-white/5',        text: 'text-text-secondary', label: 'N/A' },
};

const PRIORITY_BADGE: Record<string, string> = {
  critical:    'bg-red-500/20 text-red-300',
  required:    'bg-amber-500/20 text-amber-300',
  recommended: 'bg-blue-500/20 text-blue-300',
  optional:    'bg-white/5 text-text-secondary',
};

const STAGE_STATUS_STYLE: Record<DeploymentStageStatus, { bg: string; icon: typeof CheckCircle2 }> = {
  pending:      { bg: 'bg-white/5 border-white/10',         icon: Clock },
  in_progress:  { bg: 'bg-cyan-500/15 border-cyan-500/30',  icon: Zap },
  passed:       { bg: 'bg-green-500/15 border-green-500/30', icon: CheckCircle2 },
  failed:       { bg: 'bg-red-500/15 border-red-500/30',    icon: XCircle },
  rolled_back:  { bg: 'bg-amber-500/15 border-amber-500/30', icon: AlertTriangle },
};

export function GoLiveValidationPage() {
  const {
    checklists, items, stages, smokeTests, signOffs, readiness,
    loading, activeChecklistId,
    createChecklist, selectChecklist,
    updateItemStatus, updateItemNotes,
    advanceStage,
    recordSmokeTest,
    createSignOff,
    calculateReadiness,
  } = useGoLiveValidation();
  const { log } = useAuditLog();

  const [tab, setTab] = useState<Tab>('checklist');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showSmokeForm, setShowSmokeForm] = useState(false);
  const [showSignOffForm, setShowSignOffForm] = useState(false);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');

  // Create form
  const [cTitle, setCTitle] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cDate, setCDate] = useState('');
  const [cVersion, setCVersion] = useState('');

  // Smoke test form
  const [stName, setStName] = useState('');
  const [stModule, setStModule] = useState<GoLiveItemModule>('auth');
  const [stType, setStType] = useState<SmokeTestType>('manual');
  const [stStatus, setStStatus] = useState<'passed' | 'failed'>('passed');
  const [stError, setStError] = useState('');

  // Sign-off form
  const [soType, setSoType] = useState<SignOffType>('technical');
  const [soName, setSoName] = useState('');
  const [soRole, setSoRole] = useState('');
  const [soConditions, setSoConditions] = useState('');
  const [soNotes, setSoNotes] = useState('');

  const activeChecklist = checklists.find(c => c.id === activeChecklistId);

  const handleCreate = async () => {
    if (!cTitle.trim()) return;
    await createChecklist(cTitle.trim(), cDesc.trim() || undefined, cDate || undefined, cVersion.trim() || undefined);
    setCTitle(''); setCDesc(''); setCDate(''); setCVersion('');
    setShowCreateForm(false);
  };

  const handleRecordTest = async () => {
    if (!stName.trim() || !activeChecklistId) return;
    await recordSmokeTest(activeChecklistId, stName.trim(), stModule, stType, stStatus, undefined, stError.trim() || undefined);
    setStName(''); setStError(''); setShowSmokeForm(false);
  };

  const handleSignOff = async () => {
    if (!soName.trim() || !soRole.trim() || !activeChecklistId) return;
    await createSignOff(activeChecklistId, soType, soName.trim(), soRole.trim(), soConditions.trim() || undefined, soNotes.trim() || undefined);
    setSoName(''); setSoRole(''); setSoConditions(''); setSoNotes('');
    setShowSignOffForm(false);
  };

  const handleSaveNotes = async (itemId: string) => {
    await updateItemNotes(itemId, notesText);
    setEditingNotes(null);
  };

  const cycleStatus = (current: GoLiveItemStatus): GoLiveItemStatus => {
    const idx = STATUS_CYCLE.indexOf(current);
    return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]!;
  };

  const nextStageStatus = (current: DeploymentStageStatus): DeploymentStageStatus => {
    const map: Record<DeploymentStageStatus, DeploymentStageStatus> = {
      pending: 'in_progress', in_progress: 'passed', passed: 'passed',
      failed: 'in_progress', rolled_back: 'in_progress',
    };
    return map[current];
  };

  const handleExportCSV = () => {
    const headers = ['Module', 'Title', 'Priority', 'Status', 'Verified By', 'Evidence'];
    const rows = items.map(i => [
      MODULE_LABELS[i.module], i.title, i.priority, i.status,
      i.verified_at ? new Date(i.verified_at).toLocaleDateString() : '',
      i.evidence_notes ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv + '\n\nGenerated by SCC Compliance Monitor — a compliance reporting tool. Not an EMS. Not legal or environmental consulting. All data and reports require independent verification by qualified personnel before regulatory submission.'], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `go-live-checklist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    log('go_live_exported', { items: items.length }, { module: 'go_live', tableName: 'go_live_checklists' });
  };

  // Group items by module
  const groupedItems = items.reduce<Record<string, GoLiveChecklistItem[]>>((acc, item) => {
    (acc[item.module] ??= []).push(item);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary font-display">Go-Live Validation</h1>
          <p className="text-sm text-text-secondary mt-1">Pre-launch readiness, deployment pipeline, smoke tests, and sign-offs</p>
        </div>
        <div className="flex items-center gap-2">
          {activeChecklistId && (
            <button onClick={handleExportCSV} className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-text-secondary">
              Export CSV
            </button>
          )}
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 border border-primary/30 rounded-lg hover:bg-primary/30 text-primary"
          >
            <Plus className="w-3.5 h-3.5" />New Checklist
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <SpotlightCard className="p-4 space-y-3 border border-primary/20">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">New Go-Live Checklist</h3>
            <button onClick={() => setShowCreateForm(false)} className="text-text-secondary hover:text-text-primary"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={cTitle} onChange={e => setCTitle(e.target.value)} placeholder="Title *" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-secondary/50" />
            <input value={cVersion} onChange={e => setCVersion(e.target.value)} placeholder="Version (e.g. v1.0.0)" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-secondary/50" />
            <input type="date" value={cDate} onChange={e => setCDate(e.target.value)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary" />
            <input value={cDesc} onChange={e => setCDesc(e.target.value)} placeholder="Description" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-secondary/50" />
          </div>
          <p className="text-[10px] text-text-secondary">Creates checklist with 29 template items across 15 modules + 4 deployment stages.</p>
          <button onClick={handleCreate} disabled={!cTitle.trim()} className="px-4 py-2 text-sm bg-primary/20 border border-primary/30 rounded-lg hover:bg-primary/30 text-primary disabled:opacity-50">
            Create Checklist
          </button>
        </SpotlightCard>
      )}

      {/* Checklist Selector */}
      {checklists.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {checklists.map(cl => (
            <button
              key={cl.id}
              onClick={() => selectChecklist(cl.id)}
              className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap border transition-colors ${
                activeChecklistId === cl.id
                  ? 'bg-primary/20 border-primary/30 text-primary'
                  : 'bg-white/5 border-white/10 text-text-secondary hover:text-text-primary'
              }`}
            >
              {cl.title} {cl.deployment_version ? `(${cl.deployment_version})` : ''}
            </button>
          ))}
        </div>
      )}

      {!activeChecklist && checklists.length === 0 && (
        <p className="text-center text-text-secondary text-sm py-12">No go-live checklists yet. Create one to begin validation.</p>
      )}

      {activeChecklist && (
        <>
          {/* Readiness Dashboard */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SpotlightCard className="p-4 md:col-span-1">
              <div className="flex items-center gap-2 mb-1">
                <Rocket className={`w-5 h-5 ${readiness?.is_go ? 'text-green-400' : 'text-amber-400'}`} />
                <span className="text-xs text-text-secondary">Readiness</span>
              </div>
              <p className={`text-2xl font-bold ${
                (readiness?.readiness_score ?? 0) >= 95 ? 'text-green-400' :
                (readiness?.readiness_score ?? 0) >= 70 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {readiness?.readiness_score ?? 0}%
              </p>
              {readiness?.is_go && <p className="text-[10px] text-green-400 mt-0.5">GO FOR LAUNCH</p>}
            </SpotlightCard>

            <SpotlightCard className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-xs text-text-secondary">Checklist</span>
              </div>
              <p className="text-xl font-bold text-text-primary">{readiness?.passed_items ?? 0}/{readiness?.total_items ?? 0}</p>
              <p className="text-[10px] text-text-secondary">{readiness?.checklist_score ?? 0}%</p>
            </SpotlightCard>

            <SpotlightCard className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-text-secondary">Smoke Tests</span>
              </div>
              <p className="text-xl font-bold text-text-primary">{readiness?.passed_tests ?? 0}/{readiness?.total_tests ?? 0}</p>
              {(readiness?.failed_tests ?? 0) > 0 && <p className="text-[10px] text-red-400">{readiness!.failed_tests} failed</p>}
            </SpotlightCard>

            <SpotlightCard className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span className="text-xs text-text-secondary">Sign-offs</span>
              </div>
              <p className="text-xl font-bold text-text-primary">{readiness?.sign_off_count ?? 0}/{readiness?.sign_offs_required ?? 4}</p>
              <p className="text-[10px] text-text-secondary">{readiness?.sign_off_score ?? 0}%</p>
            </SpotlightCard>

            <SpotlightCard className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-text-secondary">Blockers</span>
              </div>
              <p className={`text-xl font-bold ${(readiness?.blockers ?? 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {readiness?.blockers ?? 0}
              </p>
              <p className="text-[10px] text-text-secondary">Critical: {readiness?.critical_passed ?? 0}/{readiness?.critical_items ?? 0}</p>
            </SpotlightCard>
          </div>

          {/* Tab Bar */}
          <div className="flex gap-1 bg-white/5 rounded-lg p-1">
            {([
              { key: 'checklist' as Tab, label: 'Validation Checklist' },
              { key: 'deploy' as Tab, label: 'Deployment Pipeline' },
              { key: 'smoke' as Tab, label: 'Smoke Tests' },
              { key: 'signoff' as Tab, label: 'Sign-offs' },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 px-4 py-2 text-sm rounded-md transition-colors ${
                  tab === t.key ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Checklist Tab */}
          {tab === 'checklist' && (
            <div className="space-y-4">
              <div className="flex items-center justify-end">
                <button
                  onClick={() => activeChecklistId && calculateReadiness(activeChecklistId)}
                  className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 text-text-secondary"
                >
                  Recalculate Score
                </button>
              </div>
              {Object.entries(groupedItems).map(([module, moduleItems]) => (
                <ModuleGroup
                  key={module}
                  module={module as GoLiveItemModule}
                  items={moduleItems}
                  onCycleStatus={(id, current) => updateItemStatus(id, cycleStatus(current))}
                  onEditNotes={(id, notes) => { setEditingNotes(id); setNotesText(notes ?? ''); }}
                  editingId={editingNotes}
                  notesText={notesText}
                  onNotesChange={setNotesText}
                  onSaveNotes={handleSaveNotes}
                  onCancelNotes={() => setEditingNotes(null)}
                />
              ))}
            </div>
          )}

          {/* Deploy Tab */}
          {tab === 'deploy' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {stages.map((stage, idx) => (
                  <StageCard
                    key={stage.id}
                    stage={stage}
                    isLast={idx === stages.length - 1}
                    onAdvance={() => advanceStage(stage.id, nextStageStatus(stage.status))}
                    onRollback={() => advanceStage(stage.id, 'rolled_back')}
                    onFail={() => advanceStage(stage.id, 'failed')}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Smoke Tests Tab */}
          {tab === 'smoke' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button onClick={() => setShowSmokeForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 border border-primary/30 rounded-lg hover:bg-primary/30 text-primary">
                  <Plus className="w-3.5 h-3.5" />Record Test
                </button>
              </div>
              {showSmokeForm && (
                <SpotlightCard className="p-4 space-y-3 border border-primary/20">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-text-primary">Record Smoke Test</h3>
                    <button onClick={() => setShowSmokeForm(false)} className="text-text-secondary hover:text-text-primary"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input value={stName} onChange={e => setStName(e.target.value)} placeholder="Test Name *" className="md:col-span-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-secondary/50" />
                    <select value={stModule} onChange={e => setStModule(e.target.value as GoLiveItemModule)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary">
                      {Object.entries(MODULE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select value={stType} onChange={e => setStType(e.target.value as SmokeTestType)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary">
                      <option value="manual">Manual</option>
                      <option value="automated">Automated</option>
                      <option value="integration">Integration</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-sm">
                      <input type="radio" name="st-status" checked={stStatus === 'passed'} onChange={() => setStStatus('passed')} />
                      <span className="text-green-400">Passed</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-sm">
                      <input type="radio" name="st-status" checked={stStatus === 'failed'} onChange={() => setStStatus('failed')} />
                      <span className="text-red-400">Failed</span>
                    </label>
                  </div>
                  {stStatus === 'failed' && (
                    <input value={stError} onChange={e => setStError(e.target.value)} placeholder="Error message" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-secondary/50 w-full" />
                  )}
                  <button onClick={handleRecordTest} disabled={!stName.trim()} className="px-4 py-2 text-sm bg-primary/20 border border-primary/30 rounded-lg hover:bg-primary/30 text-primary disabled:opacity-50">
                    Record Test
                  </button>
                </SpotlightCard>
              )}
              {smokeTests.length === 0 && !showSmokeForm && (
                <p className="text-center text-text-secondary text-sm py-8">No smoke tests recorded yet.</p>
              )}
              {smokeTests.map(test => (
                <SpotlightCard key={test.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {test.status === 'passed' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : test.status === 'failed' ? (
                        <XCircle className="w-4 h-4 text-red-400" />
                      ) : (
                        <Clock className="w-4 h-4 text-text-secondary" />
                      )}
                      <div>
                        <p className="text-sm text-text-primary">{test.test_name}</p>
                        <p className="text-xs text-text-secondary">
                          {MODULE_LABELS[test.module as GoLiveItemModule] ?? test.module} · {test.test_type}
                          {test.run_at ? ` · ${new Date(test.run_at).toLocaleString()}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] rounded ${
                      test.status === 'passed' ? 'bg-green-500/20 text-green-300' :
                      test.status === 'failed' ? 'bg-red-500/20 text-red-300' : 'bg-white/5 text-text-secondary'
                    }`}>{test.status.toUpperCase()}</span>
                  </div>
                  {test.error_message && (
                    <p className="text-xs text-red-400/80 mt-2 pl-7">{test.error_message}</p>
                  )}
                </SpotlightCard>
              ))}
            </div>
          )}

          {/* Sign-offs Tab */}
          {tab === 'signoff' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button onClick={() => setShowSignOffForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/20 border border-primary/30 rounded-lg hover:bg-primary/30 text-primary">
                  <Plus className="w-3.5 h-3.5" />Record Sign-off
                </button>
              </div>
              {showSignOffForm && (
                <SpotlightCard className="p-4 space-y-3 border border-primary/20">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-text-primary">Record Sign-off</h3>
                    <button onClick={() => setShowSignOffForm(false)} className="text-text-secondary hover:text-text-primary"><X className="w-4 h-4" /></button>
                  </div>
                  <p className="text-[10px] text-amber-400">Sign-offs are immutable. Once recorded, they cannot be edited or deleted.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <select value={soType} onChange={e => setSoType(e.target.value as SignOffType)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary">
                      {Object.entries(SIGN_OFF_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input value={soName} onChange={e => setSoName(e.target.value)} placeholder="Signer Name *" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-secondary/50" />
                    <input value={soRole} onChange={e => setSoRole(e.target.value)} placeholder="Signer Role *" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-secondary/50" />
                    <input value={soConditions} onChange={e => setSoConditions(e.target.value)} placeholder="Conditions (optional)" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-secondary/50" />
                    <textarea value={soNotes} onChange={e => setSoNotes(e.target.value)} placeholder="Notes" rows={2} className="md:col-span-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-text-primary placeholder:text-text-secondary/50" />
                  </div>
                  <button onClick={handleSignOff} disabled={!soName.trim() || !soRole.trim()} className="px-4 py-2 text-sm bg-primary/20 border border-primary/30 rounded-lg hover:bg-primary/30 text-primary disabled:opacity-50">
                    Record Sign-off
                  </button>
                </SpotlightCard>
              )}
              {/* Required sign-off grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(['technical', 'compliance', 'legal', 'executive'] as SignOffType[]).map(type => {
                  const signOff = signOffs.find(s => s.sign_off_type === type);
                  return (
                    <SpotlightCard key={type} className={`p-3 border ${signOff ? 'border-green-500/20' : 'border-white/5'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        {signOff ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Clock className="w-4 h-4 text-text-secondary" />}
                        <span className="text-xs font-medium text-text-primary">{SIGN_OFF_LABELS[type]}</span>
                      </div>
                      {signOff ? (
                        <div className="text-[10px] text-text-secondary">
                          <p>{signOff.signer_name} · {signOff.signer_role}</p>
                          <p>{new Date(signOff.signed_at).toLocaleString()}</p>
                          {signOff.conditions && <p className="text-amber-400 mt-0.5">Conditions: {signOff.conditions}</p>}
                        </div>
                      ) : (
                        <p className="text-[10px] text-text-secondary">Awaiting</p>
                      )}
                    </SpotlightCard>
                  );
                })}
              </div>
              {/* Additional sign-offs */}
              {signOffs.filter(s => !['technical', 'compliance', 'legal', 'executive'].includes(s.sign_off_type)).map(s => (
                <SpotlightCard key={s.id} className="p-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm text-text-primary">{SIGN_OFF_LABELS[s.sign_off_type]}: {s.signer_name}</span>
                    <span className="text-xs text-text-secondary">({s.signer_role})</span>
                    <span className="text-xs text-text-secondary ml-auto">{new Date(s.signed_at).toLocaleString()}</span>
                  </div>
                  {s.notes && <p className="text-xs text-text-secondary mt-1 pl-6">{s.notes}</p>}
                </SpotlightCard>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModuleGroup({
  module, items, onCycleStatus, onEditNotes,
  editingId, notesText, onNotesChange, onSaveNotes, onCancelNotes,
}: {
  module: GoLiveItemModule;
  items: GoLiveChecklistItem[];
  onCycleStatus: (id: string, current: GoLiveItemStatus) => void;
  onEditNotes: (id: string, notes: string | null) => void;
  editingId: string | null;
  notesText: string;
  onNotesChange: (v: string) => void;
  onSaveNotes: (id: string) => void;
  onCancelNotes: () => void;
}) {
  const passed = items.filter(i => i.status === 'passed').length;
  const total = items.filter(i => i.status !== 'na').length;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  return (
    <SpotlightCard className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{MODULE_LABELS[module]}</h3>
          <span className="text-xs text-text-secondary">{passed}/{total}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-text-secondary">{pct}%</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2 group">
            <button
              onClick={() => onCycleStatus(item.id, item.status)}
              className={`px-2 py-0.5 text-[10px] rounded min-w-[80px] text-center ${ITEM_STATUS_STYLE[item.status].bg} ${ITEM_STATUS_STYLE[item.status].text}`}
            >
              {ITEM_STATUS_STYLE[item.status].label}
            </button>
            <span className={`px-1.5 py-0.5 text-[10px] rounded ${PRIORITY_BADGE[item.priority]}`}>
              {item.priority}
            </span>
            <span className="text-xs text-text-primary flex-1">{item.title}</span>
            {editingId === item.id ? (
              <div className="flex items-center gap-1">
                <input
                  value={notesText}
                  onChange={e => onNotesChange(e.target.value)}
                  className="px-2 py-0.5 text-xs bg-white/5 border border-white/10 rounded w-48 text-text-primary"
                  placeholder="Evidence notes"
                />
                <button onClick={() => onSaveNotes(item.id)} className="text-green-400 text-xs">Save</button>
                <button onClick={onCancelNotes} className="text-text-secondary text-xs">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => onEditNotes(item.id, item.evidence_notes)}
                className="opacity-0 group-hover:opacity-100 text-text-secondary hover:text-text-primary"
              >
                <Pen className="w-3 h-3" />
              </button>
            )}
            {item.evidence_notes && editingId !== item.id && (
              <span className="text-[10px] text-text-secondary/60 truncate max-w-[120px]">{item.evidence_notes}</span>
            )}
          </div>
        ))}
      </div>
    </SpotlightCard>
  );
}

function StageCard({
  stage, isLast, onAdvance, onRollback, onFail,
}: {
  stage: DeploymentStage;
  isLast: boolean;
  onAdvance: () => void;
  onRollback: () => void;
  onFail: () => void;
}) {
  const style = STAGE_STATUS_STYLE[stage.status];
  const Icon = style.icon;

  return (
    <div className="flex items-center gap-2">
      <SpotlightCard className={`p-4 min-w-[180px] border ${style.bg}`}>
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-5 h-5" />
          <h3 className="text-sm font-semibold text-text-primary">{STAGE_LABELS[stage.stage_name]}</h3>
        </div>
        <p className="text-xs text-text-secondary mb-3">
          {stage.status.replace('_', ' ').toUpperCase()}
          {stage.started_at && ` · Started ${new Date(stage.started_at).toLocaleDateString()}`}
          {stage.completed_at && ` · Done ${new Date(stage.completed_at).toLocaleDateString()}`}
        </p>
        <div className="flex gap-1">
          {stage.status !== 'passed' && (
            <button onClick={onAdvance} className="px-2 py-1 text-[10px] bg-green-500/10 text-green-400 rounded hover:bg-green-500/20">
              {stage.status === 'pending' ? 'Start' : stage.status === 'in_progress' ? 'Pass' : 'Retry'}
            </button>
          )}
          {stage.status === 'in_progress' && (
            <button onClick={onFail} className="px-2 py-1 text-[10px] bg-red-500/10 text-red-400 rounded hover:bg-red-500/20">
              Fail
            </button>
          )}
          {(stage.status === 'passed' || stage.status === 'failed') && (
            <button onClick={onRollback} className="px-2 py-1 text-[10px] bg-amber-500/10 text-amber-400 rounded hover:bg-amber-500/20">
              Rollback
            </button>
          )}
        </div>
      </SpotlightCard>
      {!isLast && <ChevronRight className="w-5 h-5 text-text-secondary/30 flex-shrink-0" />}
    </div>
  );
}
