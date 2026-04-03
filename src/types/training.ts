export type TrainingCategory = 'safety' | 'compliance' | 'field_operations' | 'equipment' | 'regulatory' | 'general';

export type TrainingCompletionStatus = 'active' | 'expired' | 'revoked' | 'pending_verification';

export interface TrainingCatalogItem {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  category: TrainingCategory;
  is_certification: boolean;
  validity_months: number | null;
  renewal_window_days: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TrainingRequirement {
  id: string;
  organization_id: string;
  training_id: string;
  required_for_roles: string[];
  is_blocking: boolean;
  is_active: boolean;
  created_at: string;
}

export interface TrainingCompletion {
  id: string;
  organization_id: string;
  user_id: string;
  training_id: string;
  completed_at: string;
  expires_at: string | null;
  certificate_storage_path: string | null;
  certificate_file_name: string | null;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  status: TrainingCompletionStatus;
  created_at: string;
  updated_at: string;
}

export interface TrainingReadinessResult {
  requirement_id: string;
  training_name: string;
  is_blocking: boolean;
  is_met: boolean;
  expires_at: string | null;
  days_until_expiry: number | null;
}

export const TRAINING_CATEGORY_LABELS: Record<TrainingCategory, string> = {
  safety: 'Safety',
  compliance: 'Compliance',
  field_operations: 'Field Operations',
  equipment: 'Equipment',
  regulatory: 'Regulatory',
  general: 'General',
};

export const COMPLETION_STATUS_COLORS: Record<TrainingCompletionStatus, { bg: string; border: string; text: string }> = {
  active: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
  expired: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
  revoked: { bg: 'bg-red-600/10', border: 'border-red-600/20', text: 'text-red-300' },
  pending_verification: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
};
