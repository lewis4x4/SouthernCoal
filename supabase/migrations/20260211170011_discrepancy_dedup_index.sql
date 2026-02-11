-- Migration 019: Partial unique index on discrepancy_reviews for concurrency-safe dedup
-- Prevents duplicate discrepancies when detect-discrepancies runs concurrently
-- Partial: only enforced when status is pending/reviewed — resolved/dismissed/escalated
-- discrepancies can be re-detected if the same issue recurs after resolution

CREATE UNIQUE INDEX IF NOT EXISTS idx_dr_dedup
  ON discrepancy_reviews (organization_id, source, discrepancy_type, npdes_id, monitoring_period_end, external_source_id)
  WHERE status IN ('pending', 'reviewed');
