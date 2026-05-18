export interface MatrixCell {
  stateCode: string;
  categoryKey: string;
  status: 'empty' | 'uploaded' | 'processing' | 'imported' | 'failed';
  count: number;
  verified: boolean;
  /** Imported/parsed/embedded entries eligible for human verification */
  reviewableCount: number;
  /** Entries marked verified in the extraction trust layer */
  verifiedCount: number;
}

export interface SummaryStats {
  totalPermits: number;
  totalOutfalls: number;
  totalLimits: number;
  awaitingReview: number;
}
