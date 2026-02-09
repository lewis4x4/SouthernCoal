export interface MatrixCell {
  stateCode: string;
  categoryKey: string;
  status: 'empty' | 'uploaded' | 'processing' | 'imported' | 'failed';
  count: number;
  verified: boolean;
}

export interface SummaryStats {
  totalPermits: number;
  totalOutfalls: number;
  totalLimits: number;
  awaitingReview: number;
}
