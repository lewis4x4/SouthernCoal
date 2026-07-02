-- Slice 5 auth fix (SUPERSEDED — no-op)
--
-- This migration originally redefined public.generate_compliance_snapshot to
-- allow cron/postgres callers when get_user_org_id() is NULL. That definition
-- was superseded twice more and finally replaced in full by
-- 20260703050400_slice5_compliance_snapshot_cms_final.sql.
--
-- The intermediate body referenced columns that only exist in the final CMS
-- schema, so replaying it here added no value and only risked confusion on a
-- from-zero reset. Gutted to a comment-only no-op for replay hygiene; the
-- authoritative function definition is in the 50400 migration. 50000 remains
-- intact because it also defines run_compliance_snapshot_daily_job,
-- get_job_health, and the cron schedule.

SELECT 1;
