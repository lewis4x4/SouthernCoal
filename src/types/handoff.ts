import type { RoadmapStatus, OwnerType } from './roadmap';

// ─── Source Types ────────────────────────────────────────────────────────────

export type HandoffSourceType = 'email' | 'text' | 'call' | 'document' | 'paste';

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface HandoffInput {
  id: string;
  source_type: HandoffSourceType;
  raw_content: string;
  source_date?: string;
  source_from?: string;
  source_reference?: string;
  created_at: string;
}

// ─── Extraction Result Types ─────────────────────────────────────────────────

export type ExtractionConfidence = 'high' | 'medium' | 'low';

export interface ExtractedTaskUpdate {
  task_id: string;
  db_id?: string;
  old_status?: RoadmapStatus;
  new_status: RoadmapStatus;
  extracted_answer?: string;
  details?: string;
  database_action?: string;
  confidence: ExtractionConfidence;
  extraction_notes?: string;
  unblocks?: string[];
  new_questions?: string[];
}

export interface ExtractedQuestion {
  task_id?: string;
  question: string;
  priority: 'high' | 'medium' | 'low';
}

export interface HandoffExtractionResult {
  input_id: string;
  task_updates: ExtractedTaskUpdate[];
  new_questions: ExtractedQuestion[];
  resolved_questions: string[];
  still_outstanding: string[];
  summary: string;
  raw_ai_response?: string;
  processed_at: string;
}

// ─── Evidence Metadata ───────────────────────────────────────────────────────

export interface HandoffEvidence {
  handoff_input_id: string;
  source_type: HandoffSourceType;
  source_date: string;
  source_from: string;
  source_reference: string;
  raw_input_hash?: string;
  extracted_at: string;
}

// ─── Priority Calculation ────────────────────────────────────────────────────

export type PriorityTier = 1 | 2 | 3;

export interface PriorityScoreFactors {
  downstream_impact: number;
  is_blocker_removal: boolean;
  phase_weight: number;
  has_external_dependency: boolean;
}

export interface PriorityScore {
  total: number;
  factors: PriorityScoreFactors;
  formula: string;
}

export interface PriorityTask {
  id: string;
  db_id: string;
  task_id: string;
  task_description: string;
  phase: number;
  section: string;
  owner_type: OwnerType;
  status: RoadmapStatus;
  score: PriorityScore;
  tier: PriorityTier;
  depends_on: string[];
  blocks: string[];
  evidence_paths: string[];
  resolved_at?: string;
  resolved_by?: string;
  source?: string;
}

export interface WhatsNextQueue {
  tier_1_critical: PriorityTask[];
  tier_2_actionable: PriorityTask[];
  tier_3_parallel: PriorityTask[];
  generated_at: string;
}

// ─── Processing State ────────────────────────────────────────────────────────

export type HandoffProcessingStatus =
  | 'idle'
  | 'extracting'
  | 'previewing'
  | 'applying'
  | 'complete'
  | 'error';

export interface PendingHandoff {
  handoff_id: string;
  task_id: string;
  db_id: string;
  captured_at: string;
  expected_updated_at: string;
  previous_status: RoadmapStatus;
  new_status: RoadmapStatus;
  data: {
    answer?: string;
    details?: string;
    database_action?: string;
  };
  evidence: HandoffEvidence;
  unblocks: string[];
  new_questions: string[];
}

export interface ConflictInfo {
  reason: 'concurrent_modification' | 'task_deleted' | 'realtime_update';
  current_updated_at?: string;
  expected_updated_at?: string;
  updated_by?: string;
}

// ─── Phase Stats ─────────────────────────────────────────────────────────────

export interface PhaseStats {
  phase: number;
  label: string;
  done: number;
  partial: number;
  blocked: number;
  awaiting_tom: number;
  not_started: number;
  total: number;
}

// ─── Recently Resolved ───────────────────────────────────────────────────────

export interface ResolvedTask {
  task_id: string;
  task_description: string;
  resolved_at: string;
  source_type: HandoffSourceType;
  source_from: string;
  source_reference: string;
  answer?: string;
}
