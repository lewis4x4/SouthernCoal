/**
 * Consent Decree Obligation types — matches DB schema after migration 004.
 *
 * Actual DB columns: id, paragraph_number, title, description, obligation_type,
 * frequency, initial_due_date, next_due_date, responsible_role, status,
 * evidence_document_id, notes, created_at, updated_at,
 * completion_date, days_at_risk, penalty_tier, accrued_penalty (generated)
 */
export interface Obligation {
  id: string;
  paragraph_number: string | null;
  title: string | null;
  description: string;
  obligation_type: string | null;
  frequency: string | null;
  initial_due_date: string | null;
  next_due_date: string | null;
  responsible_role: string | null;
  status: string;
  evidence_document_id: string | null;
  notes: string | null;
  completion_date: string | null;
  // Server-generated columns (migration 004)
  days_at_risk: number;
  penalty_tier: PenaltyTier;
  accrued_penalty: number;
  created_at: string;
  updated_at: string;
}

export type PenaltyTier = 'none' | 'tier_1' | 'tier_2' | 'tier_3';
export type ObligationStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

export function tierLabel(tier: PenaltyTier): string {
  switch (tier) {
    case 'tier_1': return 'Tier 1 (1–14 days)';
    case 'tier_2': return 'Tier 2 (15–30 days)';
    case 'tier_3': return 'Tier 3 (31+ days)';
    default: return 'Current';
  }
}

export function tierColor(tier: PenaltyTier): string {
  switch (tier) {
    case 'tier_1': return 'yellow';
    case 'tier_2': return 'orange';
    case 'tier_3': return 'red';
    default: return 'emerald';
  }
}
