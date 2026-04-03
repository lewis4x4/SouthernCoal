import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useAuditLog } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import type {
  GoLiveChecklist,
  GoLiveChecklistStatus,
  GoLiveChecklistItem,
  GoLiveItemModule,
  GoLiveItemStatus,
  GoLiveItemPriority,
  DeploymentStage,
  DeploymentStageName,
  DeploymentStageStatus,
  SmokeTestRun,
  SmokeTestType,
  GoLiveSignOff,
  SignOffType,
  GoLiveReadinessResult,
} from '@/types/database';

// ---------------------------------------------------------------------------
// Default checklist template — one item per module built in Phases 1-11
// ---------------------------------------------------------------------------

interface ChecklistItemTemplate {
  module: GoLiveItemModule;
  title: string;
  priority: GoLiveItemPriority;
}

const GO_LIVE_CHECKLIST_TEMPLATE: ChecklistItemTemplate[] = [
  { module: 'auth', title: 'Auth flow: login, logout, session refresh, role assignment', priority: 'critical' },
  { module: 'auth', title: 'RLS policies block cross-org data access', priority: 'critical' },
  { module: 'upload', title: 'File upload pipeline: staging → processing → storage', priority: 'critical' },
  { module: 'upload', title: 'Allowed file types enforced; executables blocked', priority: 'required' },
  { module: 'compliance', title: 'Obligation tracker shows all 75 Consent Decree items', priority: 'critical' },
  { module: 'compliance', title: 'Coverage matrix loads per-outfall parameter grid', priority: 'required' },
  { module: 'compliance', title: 'Failure-to-sample penalties calculate correctly', priority: 'required' },
  { module: 'field_ops', title: 'Sampling calendar renders scheduled events', priority: 'required' },
  { module: 'field_ops', title: 'Field route today page loads with GPS', priority: 'recommended' },
  { module: 'field_ops', title: 'Work orders: create, assign, transition, verify', priority: 'required' },
  { module: 'reporting', title: 'Report generation produces valid CSV/PDF', priority: 'required' },
  { module: 'reporting', title: 'Disclaimer one-liner appended to all exports', priority: 'critical' },
  { module: 'violations', title: 'Violation CRUD with NOV and enforcement actions', priority: 'required' },
  { module: 'violations', title: 'Legal holds block status changes on held entities', priority: 'critical' },
  { module: 'dmr', title: 'DMR submission pipeline creates and tracks submissions', priority: 'required' },
  { module: 'incidents', title: 'Incident creation with severity and notification', priority: 'required' },
  { module: 'corrective_actions', title: 'CA workflow: open → assigned → in_progress → verified → closed', priority: 'required' },
  { module: 'audit', title: 'Audit checklists with template-based creation', priority: 'required' },
  { module: 'audit', title: 'Document completeness per-permit tracking', priority: 'required' },
  { module: 'audit', title: 'Obligation evidence linking and verification', priority: 'required' },
  { module: 'emergency', title: 'Emergency contacts and response procedures accessible', priority: 'required' },
  { module: 'system_health', title: 'Data integrity check RPC returns results', priority: 'required' },
  { module: 'system_health', title: 'Retention policies display with regulatory basis', priority: 'recommended' },
  { module: 'infrastructure', title: 'Realtime subscriptions scoped to organization', priority: 'critical' },
  { module: 'infrastructure', title: 'JWT refresh via getFreshToken() before uploads', priority: 'critical' },
  { module: 'infrastructure', title: 'Audit log captures all frontend actions fire-and-forget', priority: 'critical' },
  { module: 'security', title: 'RBAC enforced on every route, nav item, and tile', priority: 'critical' },
  { module: 'security', title: 'Unauthorized actions grayed + tooltip, never hidden', priority: 'required' },
  { module: 'security', title: 'No hardcoded credentials in source', priority: 'critical' },
];

const DEFAULT_STAGES: { name: DeploymentStageName; order: number }[] = [
  { name: 'dev', order: 1 },
  { name: 'staging', order: 2 },
  { name: 'canary', order: 3 },
  { name: 'production', order: 4 },
];

const MODULE_LABELS: Record<GoLiveItemModule, string> = {
  auth: 'Authentication',
  upload: 'Upload Pipeline',
  compliance: 'Compliance',
  field_ops: 'Field Operations',
  reporting: 'Reporting',
  work_orders: 'Work Orders',
  violations: 'Violations',
  dmr: 'DMR Submissions',
  incidents: 'Incidents',
  corrective_actions: 'Corrective Actions',
  audit: 'Audit',
  emergency: 'Emergency',
  system_health: 'System Health',
  infrastructure: 'Infrastructure',
  security: 'Security',
};

const STAGE_LABELS: Record<DeploymentStageName, string> = {
  dev: 'Development',
  staging: 'Staging',
  canary: 'Canary',
  production: 'Production',
};

const SIGN_OFF_LABELS: Record<SignOffType, string> = {
  technical: 'Technical',
  compliance: 'Compliance',
  legal: 'Legal',
  executive: 'Executive',
  security: 'Security',
  operational: 'Operational',
};

export { MODULE_LABELS, STAGE_LABELS, SIGN_OFF_LABELS };

export function useGoLiveValidation() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { log } = useAuditLog();
  const orgId = profile?.organization_id ?? null;

  const [checklists, setChecklists] = useState<GoLiveChecklist[]>([]);
  const [items, setItems] = useState<GoLiveChecklistItem[]>([]);
  const [stages, setStages] = useState<DeploymentStage[]>([]);
  const [smokeTests, setSmokeTests] = useState<SmokeTestRun[]>([]);
  const [signOffs, setSignOffs] = useState<GoLiveSignOff[]>([]);
  const [readiness, setReadiness] = useState<GoLiveReadinessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeChecklistId, setActiveChecklistId] = useState<string | null>(null);

  // -- Checklists --

  const fetchChecklists = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('go_live_checklists')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[go-live] checklists fetch error:', error.message);
    } else {
      setChecklists((data ?? []) as GoLiveChecklist[]);
    }
  }, [orgId]);

  const createChecklist = useCallback(async (title: string, description?: string, targetDate?: string, version?: string) => {
    if (!orgId || !user) return;

    // Create master checklist
    const { data: cl, error } = await supabase.from('go_live_checklists').insert({
      organization_id: orgId,
      title,
      description: description || null,
      target_date: targetDate || null,
      deployment_version: version || null,
      created_by: user.id,
    }).select('id').single();

    if (error || !cl) {
      toast.error('Failed to create checklist');
      console.error('[go-live] create checklist error:', error?.message);
      return;
    }

    const checklistId = cl.id;

    // Seed template items
    const templateItems = GO_LIVE_CHECKLIST_TEMPLATE.map(t => ({
      checklist_id: checklistId,
      organization_id: orgId,
      module: t.module,
      title: t.title,
      priority: t.priority,
    }));
    await supabase.from('go_live_checklist_items').insert(templateItems);

    // Seed deployment stages
    const stageRows = DEFAULT_STAGES.map(s => ({
      checklist_id: checklistId,
      organization_id: orgId,
      stage_name: s.name,
      stage_order: s.order,
    }));
    await supabase.from('deployment_stages').insert(stageRows);

    toast.success('Go-live checklist created with template items');
    log('go_live_checklist_created', { title, items: templateItems.length }, { module: 'go_live', tableName: 'go_live_checklists', recordId: checklistId });

    setActiveChecklistId(checklistId);
    fetchChecklists();
    fetchItems(checklistId);
    fetchStages(checklistId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, user, fetchChecklists, log]);

  const updateChecklistStatus = useCallback(async (id: string, status: GoLiveChecklistStatus) => {
    const { error } = await supabase.from('go_live_checklists').update({ status }).eq('id', id);
    if (error) { toast.error('Failed to update status'); return; }
    toast.success(`Checklist marked ${status}`);
    log('go_live_status_changed', { id, status }, { module: 'go_live', tableName: 'go_live_checklists', recordId: id });
    fetchChecklists();
  }, [fetchChecklists, log]);

  // -- Items --

  const fetchItems = useCallback(async (checklistId: string) => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('go_live_checklist_items')
      .select('*')
      .eq('checklist_id', checklistId)
      .order('module')
      .order('priority');
    if (error) {
      console.error('[go-live] items fetch error:', error.message);
    } else {
      setItems((data ?? []) as GoLiveChecklistItem[]);
    }
  }, [orgId]);

  const updateItemStatus = useCallback(async (itemId: string, status: GoLiveItemStatus) => {
    const updates: Record<string, unknown> = { status };
    if (status === 'passed' && user) {
      updates.verified_by = user.id;
      updates.verified_at = new Date().toISOString();
    }
    const { error } = await supabase.from('go_live_checklist_items').update(updates).eq('id', itemId);
    if (error) { toast.error('Failed to update item'); return; }
    log('go_live_item_updated', { itemId, status }, { module: 'go_live', tableName: 'go_live_checklist_items', recordId: itemId });
    if (activeChecklistId) fetchItems(activeChecklistId);
  }, [user, activeChecklistId, fetchItems, log]);

  const updateItemNotes = useCallback(async (itemId: string, evidence_notes: string) => {
    const { error } = await supabase.from('go_live_checklist_items').update({ evidence_notes }).eq('id', itemId);
    if (error) { toast.error('Failed to save notes'); return; }
    if (activeChecklistId) fetchItems(activeChecklistId);
  }, [activeChecklistId, fetchItems]);

  // -- Deployment Stages --

  const fetchStages = useCallback(async (checklistId: string) => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('deployment_stages')
      .select('*')
      .eq('checklist_id', checklistId)
      .order('stage_order');
    if (error) {
      console.error('[go-live] stages fetch error:', error.message);
    } else {
      setStages((data ?? []) as DeploymentStage[]);
    }
  }, [orgId]);

  const advanceStage = useCallback(async (stageId: string, status: DeploymentStageStatus) => {
    if (!user) return;
    const updates: Record<string, unknown> = { status };
    if (status === 'in_progress') updates.started_at = new Date().toISOString();
    if (status === 'passed') {
      updates.completed_at = new Date().toISOString();
      updates.deployed_by = user.id;
    }
    const { error } = await supabase.from('deployment_stages').update(updates).eq('id', stageId);
    if (error) { toast.error('Failed to update stage'); return; }
    toast.success(`Stage updated to ${status}`);
    log('deployment_stage_advanced', { stageId, status }, { module: 'go_live', tableName: 'deployment_stages', recordId: stageId });
    if (activeChecklistId) fetchStages(activeChecklistId);
  }, [user, activeChecklistId, fetchStages, log]);

  // -- Smoke Tests --

  const fetchSmokeTests = useCallback(async (checklistId: string) => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('smoke_test_runs')
      .select('*')
      .eq('checklist_id', checklistId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[go-live] smoke tests fetch error:', error.message);
    } else {
      setSmokeTests((data ?? []) as SmokeTestRun[]);
    }
  }, [orgId]);

  const recordSmokeTest = useCallback(async (
    checklistId: string,
    testName: string,
    module: string,
    testType: SmokeTestType,
    status: 'passed' | 'failed',
    durationMs?: number,
    errorMessage?: string,
  ) => {
    if (!orgId || !user) return;
    const { error } = await supabase.from('smoke_test_runs').insert({
      checklist_id: checklistId,
      organization_id: orgId,
      test_name: testName,
      module,
      test_type: testType,
      status,
      duration_ms: durationMs ?? null,
      error_message: errorMessage ?? null,
      run_by: user.id,
      run_at: new Date().toISOString(),
    });
    if (error) { toast.error('Failed to record test'); return; }
    toast.success(`Smoke test ${status}`);
    log('smoke_test_recorded', { testName, module, status }, { module: 'go_live', tableName: 'smoke_test_runs' });
    fetchSmokeTests(checklistId);
  }, [orgId, user, fetchSmokeTests, log]);

  // -- Sign-Offs --

  const fetchSignOffs = useCallback(async (checklistId: string) => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('go_live_sign_offs')
      .select('*')
      .eq('checklist_id', checklistId)
      .order('signed_at');
    if (error) {
      console.error('[go-live] sign-offs fetch error:', error.message);
    } else {
      setSignOffs((data ?? []) as GoLiveSignOff[]);
    }
  }, [orgId]);

  const createSignOff = useCallback(async (
    checklistId: string,
    signOffType: SignOffType,
    signerName: string,
    signerRole: string,
    conditions?: string,
    notes?: string,
  ) => {
    if (!orgId || !user) return;
    const { error } = await supabase.from('go_live_sign_offs').insert({
      checklist_id: checklistId,
      organization_id: orgId,
      sign_off_type: signOffType,
      signed_by: user.id,
      signer_name: signerName,
      signer_role: signerRole,
      conditions: conditions || null,
      notes: notes || null,
    });
    if (error) { toast.error('Failed to record sign-off'); return; }
    toast.success(`${SIGN_OFF_LABELS[signOffType]} sign-off recorded`);
    log('go_live_sign_off_created', { signOffType, signerName }, { module: 'go_live', tableName: 'go_live_sign_offs' });
    fetchSignOffs(checklistId);
  }, [orgId, user, fetchSignOffs, log]);

  // -- Readiness Score --

  const calculateReadiness = useCallback(async (checklistId: string) => {
    const { data, error } = await supabase.rpc('calculate_go_live_readiness', {
      p_checklist_id: checklistId,
    });
    if (error) {
      console.error('[go-live] readiness calc error:', error.message);
      return;
    }
    setReadiness(data as GoLiveReadinessResult);
    fetchChecklists(); // refresh score on checklist card
  }, [fetchChecklists]);

  // -- Select Active Checklist --

  const selectChecklist = useCallback(async (checklistId: string) => {
    setActiveChecklistId(checklistId);
    await Promise.all([
      fetchItems(checklistId),
      fetchStages(checklistId),
      fetchSmokeTests(checklistId),
      fetchSignOffs(checklistId),
      calculateReadiness(checklistId),
    ]);
  }, [fetchItems, fetchStages, fetchSmokeTests, fetchSignOffs, calculateReadiness]);

  // -- Init --

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    fetchChecklists().finally(() => setLoading(false));
  }, [orgId, fetchChecklists]);

  // Auto-select first checklist
  useEffect(() => {
    if (checklists.length > 0 && !activeChecklistId) {
      selectChecklist(checklists[0]!.id);
    }
  }, [checklists, activeChecklistId, selectChecklist]);

  return {
    checklists,
    items,
    stages,
    smokeTests,
    signOffs,
    readiness,
    loading,
    activeChecklistId,
    // Checklists
    createChecklist,
    updateChecklistStatus,
    selectChecklist,
    // Items
    updateItemStatus,
    updateItemNotes,
    // Stages
    advanceStage,
    // Smoke Tests
    recordSmokeTest,
    // Sign-Offs
    createSignOff,
    // Readiness
    calculateReadiness,
  };
}
