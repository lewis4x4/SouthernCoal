-- =============================================================================
-- Migration 004: Consent Decree Penalty Calculation Functions + Generated Columns
-- =============================================================================
-- Run manually in Supabase SQL Editor.
--
-- Adds:
--   1. completion_date column (tracks when obligation was fulfilled)
--   2. calculate_days_at_risk(next_due_date, completion_date) function
--   3. calculate_stipulated_penalty(obligation_type, days_late) function
--   4. Generated columns: days_at_risk, penalty_tier, accrued_penalty
--   5. RLS INSERT policy for consent_decree_obligations
--
-- Existing columns used:
--   next_due_date (date), obligation_type (text), status (text)
--
-- IMPORTANT: The IMMUTABLE keyword on calculate_days_at_risk is required by
-- PostgreSQL for generated columns, but technically incorrect since it uses
-- CURRENT_DATE. This means days_at_risk only recalculates when the row is
-- written (INSERT/UPDATE), NOT daily. To keep values fresh, set up a daily
-- cron job (pg_cron or scheduled Edge Function):
--
--   SELECT cron.schedule(
--     'refresh-obligation-penalties',
--     '0 6 * * *',  -- 6:00 AM daily
--     $$UPDATE consent_decree_obligations
--       SET updated_at = now()
--       WHERE completion_date IS NULL
--         AND status != 'completed'$$
--   );
-- =============================================================================

-- 1. Add completion_date column if it doesn't exist
ALTER TABLE consent_decree_obligations
ADD COLUMN IF NOT EXISTS completion_date DATE;

-- 2. Penalty calculation: days at risk
--    Uses next_due_date (not initial_due_date) since that's the current deadline.
CREATE OR REPLACE FUNCTION calculate_days_at_risk(
  p_next_due_date DATE,
  p_completion_date DATE
) RETURNS INTEGER AS $$
BEGIN
  IF p_next_due_date IS NULL THEN
    RETURN 0;
  END IF;
  IF p_completion_date IS NOT NULL THEN
    RETURN GREATEST(0, p_completion_date - p_next_due_date);
  ELSE
    RETURN GREATEST(0, CURRENT_DATE - p_next_due_date);
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Penalty calculation: stipulated penalty per Consent Decree
--    Case 7:16-cv-00462-GEC
--
--    Base CD violations (EMS audit, treatment inspection, database maintenance):
--      Tier 1 (1-14 days):  $1,000/day
--      Tier 2 (15-30 days): $2,500/day
--      Tier 3 (31+ days):   $4,500/day
--
--    Reporting violations (DMR submission, quarterly report, WET report, biological survey):
--      Tier 1 (1-14 days):  $250/day
--      Tier 2 (15-30 days): $500/day
--      Tier 3 (31+ days):   $1,250/day
CREATE OR REPLACE FUNCTION calculate_stipulated_penalty(
  p_obligation_type TEXT,
  p_days_late INTEGER
) RETURNS DECIMAL AS $$
BEGIN
  IF p_days_late IS NULL OR p_days_late <= 0 THEN
    RETURN 0.00;
  END IF;

  -- Base CD violations
  IF p_obligation_type IN ('ems_audit', 'treatment_inspection', 'database_maintenance') THEN
    CASE
      WHEN p_days_late BETWEEN 1 AND 14 THEN RETURN 1000.00 * p_days_late;
      WHEN p_days_late BETWEEN 15 AND 30 THEN RETURN 2500.00 * p_days_late;
      WHEN p_days_late > 30 THEN RETURN 4500.00 * p_days_late;
      ELSE RETURN 0.00;
    END CASE;

  -- Reporting violations
  ELSIF p_obligation_type IN ('dmr_submission', 'quarterly_report', 'wet_report', 'biological_survey') THEN
    CASE
      WHEN p_days_late BETWEEN 1 AND 14 THEN RETURN 250.00 * p_days_late;
      WHEN p_days_late BETWEEN 15 AND 30 THEN RETURN 500.00 * p_days_late;
      WHEN p_days_late > 30 THEN RETURN 1250.00 * p_days_late;
      ELSE RETURN 0.00;
    END CASE;

  -- Unknown obligation types — no penalty
  ELSE
    RETURN 0.00;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Add generated columns
--    References next_due_date (the current deadline) not initial_due_date.
ALTER TABLE consent_decree_obligations
ADD COLUMN IF NOT EXISTS days_at_risk INTEGER GENERATED ALWAYS AS (
  calculate_days_at_risk(next_due_date, completion_date)
) STORED,
ADD COLUMN IF NOT EXISTS penalty_tier TEXT GENERATED ALWAYS AS (
  CASE
    WHEN calculate_days_at_risk(next_due_date, completion_date) = 0 THEN 'none'
    WHEN calculate_days_at_risk(next_due_date, completion_date) BETWEEN 1 AND 14 THEN 'tier_1'
    WHEN calculate_days_at_risk(next_due_date, completion_date) BETWEEN 15 AND 30 THEN 'tier_2'
    WHEN calculate_days_at_risk(next_due_date, completion_date) > 30 THEN 'tier_3'
    ELSE 'none'
  END
) STORED,
ADD COLUMN IF NOT EXISTS accrued_penalty DECIMAL GENERATED ALWAYS AS (
  calculate_stipulated_penalty(obligation_type, calculate_days_at_risk(next_due_date, completion_date))
) STORED;

-- 5. RLS INSERT policy for auto-generating obligations from frontend
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'consent_decree_obligations'
      AND policyname = 'Authenticated users can insert obligations'
  ) THEN
    CREATE POLICY "Authenticated users can insert obligations"
      ON consent_decree_obligations FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- Verify after running:
--   SELECT id, obligation_type, next_due_date, days_at_risk, penalty_tier, accrued_penalty
--   FROM consent_decree_obligations
--   ORDER BY days_at_risk DESC
--   LIMIT 10;
-- =============================================================================
