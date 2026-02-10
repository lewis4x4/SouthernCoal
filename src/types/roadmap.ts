export type RoadmapStatus = 'not_started' | 'in_progress' | 'blocked' | 'complete' | 'na';
export type OwnerType = 'you' | 'tom' | 'scc_mgmt' | 'both' | 'legal' | 'software';

export interface RoadmapTask {
  id: string;
  organization_id: string;
  task_id: string;
  phase: number;
  section: string;
  task_description: string;
  owner_type: OwnerType;
  assigned_to: string | null;
  depends_on: string[] | null;
  status: RoadmapStatus;
  evidence_paths: string[] | null;
  notes: string | null;
  completed_at: string | null;
  completed_by: string | null;
  is_new_v3: boolean;
  created_at: string;
  updated_at: string;
}

export const STATUS_LABELS: Record<RoadmapStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  complete: 'Complete',
  na: 'N/A',
};

export const STATUS_COLORS: Record<RoadmapStatus, string> = {
  not_started: 'bg-white/5 text-text-muted border-white/10',
  in_progress: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  blocked: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  complete: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  na: 'bg-white/5 text-text-muted border-white/10',
};

export const OWNER_LABELS: Record<OwnerType, string> = {
  you: 'Tom',
  tom: 'Tom',
  scc_mgmt: 'SCC Mgmt',
  both: 'Both',
  legal: 'Legal',
  software: 'Software',
};

export const OWNER_COLORS: Record<OwnerType, string> = {
  you: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  tom: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  scc_mgmt: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  both: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  legal: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  software: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

export const PHASE_LABELS: Record<number, string> = {
  1: 'Phase 1 — Foundation',
  2: 'Phase 2 — Data Collection',
  3: 'Phase 3 — Software Build',
  4: 'Phase 4 — EMS & Documentation',
  5: 'Phase 5 — Go-Live & Validation',
};
