
-- P0: Enable RLS + add consistent policies on all new tables
-- Matches existing pattern: emails, contacts, email_triage all use RLS + permissive ALL

-- email_sender_trust
ALTER TABLE email_sender_trust ENABLE ROW LEVEL SECURITY;
CREATE POLICY sender_trust_all ON email_sender_trust FOR ALL TO public USING (true) WITH CHECK (true);

-- skill_registry
ALTER TABLE skill_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY skill_registry_all ON skill_registry FOR ALL TO public USING (true) WITH CHECK (true);

-- skill_execution_log
ALTER TABLE skill_execution_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY skill_exec_log_all ON skill_execution_log FOR ALL TO public USING (true) WITH CHECK (true);

-- skill_feedback
ALTER TABLE skill_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY skill_feedback_all ON skill_feedback FOR ALL TO public USING (true) WITH CHECK (true);

-- P1: Missing index on skill_feedback.skill_name for lookups
CREATE INDEX IF NOT EXISTS idx_skill_feedback_name ON skill_feedback(skill_name);

-- P1: Missing index on email_noise_rules for rule matching performance
-- (rule_type + enabled covering index for the RPC query)
CREATE INDEX IF NOT EXISTS idx_noise_rules_type_enabled ON email_noise_rules(rule_type, enabled) WHERE enabled = true;
;
