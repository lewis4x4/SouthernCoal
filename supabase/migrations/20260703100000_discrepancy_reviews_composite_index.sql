-- Code-review remediation (DB-6): composite index for the Review Queue's hot
-- path. The list and count queries filter organization_id + status (+ severity)
-- and order by severity, detected_at DESC. Existing single-column indexes force
-- a bitmap-AND + sort on a 149K-row table; this composite serves the filter and
-- the leading sort key directly.
CREATE INDEX IF NOT EXISTS idx_dr_org_status_sev_detected
  ON public.discrepancy_reviews (organization_id, status, severity, detected_at DESC);
