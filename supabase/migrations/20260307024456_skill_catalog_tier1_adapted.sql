
-- Skill Catalog Tier 1 (adapted for remote state)

------------------------------------------------------------
-- 1. Adapt existing email_noise_rules: add account_id column
------------------------------------------------------------
ALTER TABLE email_noise_rules ADD COLUMN IF NOT EXISTS account_id UUID;
CREATE INDEX IF NOT EXISTS idx_noise_rules_account ON email_noise_rules(account_id) WHERE enabled = true;

------------------------------------------------------------
-- 2. check_noise_rules RPC (adapted for existing schema)
--    Uses: enabled (not dry_run), hits (not hit_count), user_id + account_id
------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_noise_rules(p_email_id UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_sender TEXT;
    v_subject TEXT;
    v_account_id UUID;
    v_rule RECORD;
BEGIN
    SELECT sender_email, subject, account_id
    INTO v_sender, v_subject, v_account_id
    FROM emails
    WHERE id = p_email_id;

    IF v_sender IS NULL THEN
        RETURN json_build_object('matched', false);
    END IF;

    SELECT id, rule_name, rule_type, action
    INTO v_rule
    FROM email_noise_rules
    WHERE enabled = true
      AND (account_id = v_account_id OR account_id IS NULL)
      AND (
        (rule_type = 'sender_email' AND lower(v_sender) = lower(match_value))
        OR (rule_type = 'sender_domain' AND lower(v_sender) LIKE '%@' || lower(match_value))
        OR (rule_type = 'subject_contains' AND lower(v_subject) LIKE '%' || lower(match_value) || '%')
      )
    ORDER BY
        CASE rule_type
            WHEN 'sender_email' THEN 1
            WHEN 'sender_domain' THEN 2
            WHEN 'subject_contains' THEN 3
            WHEN 'body_contains' THEN 4
        END
    LIMIT 1;

    IF v_rule IS NULL THEN
        RETURN json_build_object('matched', false);
    END IF;

    UPDATE email_noise_rules
    SET hits = COALESCE(hits, 0) + 1,
        last_hit_at = now()
    WHERE id = v_rule.id;

    RETURN json_build_object(
        'matched', true,
        'rule_name', v_rule.rule_name,
        'rule_id', v_rule.id,
        'action', v_rule.action
    );
END;
$$;

------------------------------------------------------------
-- 3. email_sender_trust table
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_sender_trust (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_email TEXT NOT NULL,
    trust_level INTEGER NOT NULL DEFAULT 0 CHECK (trust_level BETWEEN 0 AND 4),
    total_emails INTEGER NOT NULL DEFAULT 0,
    approvals_without_edit INTEGER NOT NULL DEFAULT 0,
    account_id UUID,
    workspace TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(sender_email, account_id)
);

------------------------------------------------------------
-- 4. skill_registry + supporting tables
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skill_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
    gate TEXT NOT NULL DEFAULT 'GREEN',
    chains_to JSONB NOT NULL DEFAULT '[]'::jsonb,
    chains_from JSONB NOT NULL DEFAULT '[]'::jsonb,
    character TEXT,
    avg_tokens INTEGER,
    file_path TEXT NOT NULL,
    content_hash TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    execution_count INTEGER NOT NULL DEFAULT 0,
    last_executed_at TIMESTAMPTZ,
    success_rate NUMERIC(5,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (suite, name)
);

CREATE INDEX IF NOT EXISTS idx_skill_registry_suite ON skill_registry(suite);
CREATE INDEX IF NOT EXISTS idx_skill_registry_name ON skill_registry(name);

CREATE TABLE IF NOT EXISTS skill_execution_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    skill_name TEXT NOT NULL,
    suite TEXT,
    chain_name TEXT,
    chain_position INTEGER,
    trigger_type TEXT NOT NULL,
    agent TEXT NOT NULL DEFAULT 'jarvis_coo',
    mode TEXT NOT NULL,
    duration_ms INTEGER,
    tokens_used INTEGER,
    status TEXT NOT NULL,
    output_summary TEXT,
    error_message TEXT,
    context_window_usage INTEGER,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_skill_exec_name ON skill_execution_log(skill_name);
CREATE INDEX IF NOT EXISTS idx_skill_exec_agent ON skill_execution_log(agent);
CREATE INDEX IF NOT EXISTS idx_skill_exec_created ON skill_execution_log(created_at DESC);

CREATE TABLE IF NOT EXISTS skill_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    skill_name TEXT NOT NULL,
    correction_type TEXT NOT NULL,
    action_taken TEXT NOT NULL,
    correction TEXT NOT NULL,
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    learned_rule TEXT,
    applied BOOLEAN NOT NULL DEFAULT false
);

------------------------------------------------------------
-- 5. Register Tier 1 skills
------------------------------------------------------------
INSERT INTO skill_registry (name, suite, description, triggers, gate, chains_to, chains_from, character, avg_tokens, file_path, enabled)
VALUES
  ('omi-pricing-memory', 'operations',
   'Extract and log dollar amounts from Omi conversations into a searchable pricing database',
   '["omi-pricing-memory", "pricing history", "what did we quote"]'::jsonb,
   'GREEN', '["ops-meeting-prep"]'::jsonb, '["ops-omi-processor"]'::jsonb,
   'C-3PO', 600, 'operations/omi-pricing-memory/SKILL.md', true),

  ('omi-scope-creep-detector', 'operations',
   'Detect scope additions in Omi conversations linked to active projects before they become unpriced work',
   '["omi-scope-creep-detector", "scope creep", "scope addition"]'::jsonb,
   'GREEN', '[]'::jsonb, '["ops-omi-processor"]'::jsonb,
   'C-3PO', 600, 'operations/omi-scope-creep-detector/SKILL.md', true),

  ('omi-revenue-signal-detector', 'operations',
   'Detect upsell and expansion signals in Omi conversations and surface them for follow-up',
   '["omi-revenue-signal-detector", "revenue signal", "upsell opportunity"]'::jsonb,
   'GREEN', '[]'::jsonb, '["ops-omi-processor"]'::jsonb,
   'C-3PO', 600, 'operations/omi-revenue-signal-detector/SKILL.md', true),

  ('omi-decision-logger', 'operations',
   'Capture decisions from Omi meetings and link them to relevant projects',
   '["omi-decision-logger", "decision log", "what did we decide"]'::jsonb,
   'GREEN', '["notion-meeting-notes"]'::jsonb, '["ops-omi-processor"]'::jsonb,
   'C-3PO', 500, 'operations/omi-decision-logger/SKILL.md', true),

  ('ambient-life-capture', 'personal',
   'Capture personal context from non-business Omi conversations — birthdays, restaurants, family notes',
   '["ambient-life-capture", "personal capture", "life notes"]'::jsonb,
   'GREEN', '["notion-personal-kb"]'::jsonb, '["ops-omi-processor"]'::jsonb,
   'Yoda', 400, 'personal/ambient-life-capture/SKILL.md', true),

  ('client-personality-profiler', 'research',
   'Build evolving personality profiles for contacts after 3+ Omi conversations',
   '["client-personality-profiler", "client profile", "personality profile"]'::jsonb,
   'GREEN', '["ops-meeting-prep"]'::jsonb, '["ops-omi-processor"]'::jsonb,
   'C-3PO', 800, 'research/client-personality-profiler/SKILL.md', true),

  ('relationship-decay-detector', 'research',
   'Track contact mention frequency and alert when VIP contacts go quiet (30+ days)',
   '["relationship-decay-detector", "relationship decay", "cold contacts"]'::jsonb,
   'GREEN', '[]'::jsonb, '[]'::jsonb,
   'C-3PO', 500, 'research/relationship-decay-detector/SKILL.md', true),

  ('omi-delegation-tracker', 'operations',
   'Capture verbal delegations from Omi meetings and track them as assigned tasks',
   '["omi-delegation-tracker", "delegation tracker", "who did I assign"]'::jsonb,
   'GREEN', '[]'::jsonb, '["ops-omi-processor"]'::jsonb,
   'C-3PO', 500, 'operations/omi-delegation-tracker/SKILL.md', true),

  ('omi-knowledge-gap-filler', 'operations',
   'Capture moments of uncertainty in meetings and proactively research answers',
   '["omi-knowledge-gap-filler", "knowledge gap", "what did I need to look up"]'::jsonb,
   'GREEN', '[]'::jsonb, '["ops-omi-processor"]'::jsonb,
   'C-3PO', 600, 'operations/omi-knowledge-gap-filler/SKILL.md', true),

  ('email-noise-rules-engine', 'email',
   'Auto-learn noise rules from archive patterns. After archiving 3 emails from same sender, suggest noise rule.',
   '["email-noise-rules-engine", "noise rules", "email noise", "auto archive rules"]'::jsonb,
   'GREEN', '[]'::jsonb, '["inbox-zero-classify"]'::jsonb,
   'C-3PO', 600, 'email/email-noise-rules-engine/SKILL.md', true)

ON CONFLICT (suite, name) DO UPDATE SET
  description = EXCLUDED.description,
  triggers = EXCLUDED.triggers,
  gate = EXCLUDED.gate,
  chains_to = EXCLUDED.chains_to,
  chains_from = EXCLUDED.chains_from,
  character = EXCLUDED.character,
  avg_tokens = EXCLUDED.avg_tokens,
  file_path = EXCLUDED.file_path,
  updated_at = now();
;
