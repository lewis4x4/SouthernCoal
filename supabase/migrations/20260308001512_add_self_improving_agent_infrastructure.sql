
-- ============================================================
-- SELF-IMPROVING AGENT INFRASTRUCTURE
-- Layer 3: Memory store
-- Layer 2: Prompt versioning on skill_registry
-- Layer 1: Auto-fix rules + escalation log
-- ============================================================

-- Extend skill_execution_log with memory context
ALTER TABLE public.skill_execution_log
  ADD COLUMN IF NOT EXISTS memory_context      JSONB,
  ADD COLUMN IF NOT EXISTS learned_patterns    JSONB,
  ADD COLUMN IF NOT EXISTS auto_fix_applied    TEXT,
  ADD COLUMN IF NOT EXISTS auto_fix_success    BOOLEAN,
  ADD COLUMN IF NOT EXISTS prompt_version      INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS run_quality_score   NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS escalated_to_linear BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS linear_issue_id     TEXT;

-- Extend skill_registry with self-improvement fields
ALTER TABLE public.skill_registry
  ADD COLUMN IF NOT EXISTS self_improve_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_fix_rules        JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS prompt_version        INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS prompt_history        JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS failure_count_24h     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_prompt_update    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS improvement_notes     TEXT;

-- New table: agent_run_memory
-- The canonical memory store queried at the start of every agent run
CREATE TABLE IF NOT EXISTS public.agent_run_memory (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_handle        TEXT NOT NULL,
  task_type           TEXT NOT NULL,
  run_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  success             BOOLEAN NOT NULL,
  error_type          TEXT,          -- 'network' | 'schema' | 'auth' | 'data_format' | 'timeout' | 'unknown'
  error_message       TEXT,
  auto_fix_applied    TEXT,
  auto_fix_success    BOOLEAN,
  payload_hash        TEXT,          -- hash of input payload for dedup/pattern detection
  result_summary      JSONB,         -- key metrics from this run (records_synced, violations_found, etc.)
  learned_this_run    JSONB,         -- what the agent learned: patterns, thresholds, new rules
  prompt_version_used INTEGER,
  context_loaded      JSONB,         -- what memory was loaded at start of this run
  linear_issue_id     TEXT,
  linear_issue_url    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arm_agent_handle ON public.agent_run_memory(agent_handle);
CREATE INDEX IF NOT EXISTS idx_arm_task_type    ON public.agent_run_memory(task_type);
CREATE INDEX IF NOT EXISTS idx_arm_run_at       ON public.agent_run_memory(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_arm_success      ON public.agent_run_memory(success);

-- New table: agent_fix_library
-- Accumulated library of working auto-fixes, grows over time
CREATE TABLE IF NOT EXISTS public.agent_fix_library (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_handle     TEXT NOT NULL,
  error_signature  TEXT NOT NULL,    -- normalized error pattern
  error_type       TEXT NOT NULL,
  fix_strategy     TEXT NOT NULL,    -- description of the fix
  fix_code         TEXT,             -- actual code/config change applied
  success_count    INTEGER DEFAULT 1,
  failure_count    INTEGER DEFAULT 0,
  success_rate     NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN (success_count + failure_count) = 0 THEN 0
    ELSE ROUND(success_count::numeric / (success_count + failure_count) * 100, 2)
    END
  ) STORED,
  last_used_at     TIMESTAMPTZ DEFAULT now(),
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_handle, error_signature)
);

CREATE INDEX IF NOT EXISTS idx_afl_agent   ON public.agent_fix_library(agent_handle);
CREATE INDEX IF NOT EXISTS idx_afl_error   ON public.agent_fix_library(error_signature);

-- RPC: get_agent_memory
-- Returns last N runs + fix library for a given agent (called at start of each run)
CREATE OR REPLACE FUNCTION public.get_agent_memory(
  p_agent_handle TEXT,
  p_task_type    TEXT DEFAULT NULL,
  p_limit        INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_recent_runs   JSONB;
  v_fix_library   JSONB;
  v_skill_prompt  JSONB;
  v_stats         JSONB;
BEGIN
  -- Last N runs
  SELECT jsonb_agg(r ORDER BY r.run_at DESC)
  INTO v_recent_runs
  FROM (
    SELECT run_at, success, error_type, auto_fix_applied, auto_fix_success,
           result_summary, learned_this_run, prompt_version_used
    FROM public.agent_run_memory
    WHERE agent_handle = p_agent_handle
      AND (p_task_type IS NULL OR task_type = p_task_type)
    ORDER BY run_at DESC
    LIMIT p_limit
  ) r;

  -- Fix library for this agent
  SELECT jsonb_agg(f ORDER BY f.success_count DESC)
  INTO v_fix_library
  FROM (
    SELECT error_signature, error_type, fix_strategy, fix_code,
           success_count, failure_count, success_rate
    FROM public.agent_fix_library
    WHERE agent_handle = p_agent_handle
    ORDER BY success_count DESC
    LIMIT 20
  ) f;

  -- Current skill prompt + version
  SELECT jsonb_build_object(
    'description',      description,
    'triggers',         triggers,
    'prompt_version',   prompt_version,
    'auto_fix_rules',   auto_fix_rules,
    'improvement_notes',improvement_notes
  )
  INTO v_skill_prompt
  FROM public.skill_registry
  WHERE name = p_agent_handle
  LIMIT 1;

  -- 24h stats
  SELECT jsonb_build_object(
    'total_runs',       COUNT(*),
    'success_rate',     ROUND(AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) * 100, 1),
    'auto_fix_rate',    ROUND(AVG(CASE WHEN auto_fix_applied IS NOT NULL THEN 1.0 ELSE 0.0 END) * 100, 1),
    'last_run_at',      MAX(run_at)
  )
  INTO v_stats
  FROM public.agent_run_memory
  WHERE agent_handle = p_agent_handle
    AND run_at > now() - interval '24 hours';

  RETURN jsonb_build_object(
    'agent_handle',  p_agent_handle,
    'recent_runs',   COALESCE(v_recent_runs, '[]'::jsonb),
    'fix_library',   COALESCE(v_fix_library, '[]'::jsonb),
    'skill_config',  COALESCE(v_skill_prompt, '{}'::jsonb),
    'stats_24h',     COALESCE(v_stats, '{}'::jsonb),
    'memory_loaded_at', now()
  );
END;
$$;

-- RPC: log_agent_run
-- Called at end of every agent run to persist learnings
CREATE OR REPLACE FUNCTION public.log_agent_run(
  p_agent_handle      TEXT,
  p_task_type         TEXT,
  p_success           BOOLEAN,
  p_result_summary    JSONB DEFAULT NULL,
  p_error_type        TEXT DEFAULT NULL,
  p_error_message     TEXT DEFAULT NULL,
  p_auto_fix_applied  TEXT DEFAULT NULL,
  p_auto_fix_success  BOOLEAN DEFAULT NULL,
  p_learned_this_run  JSONB DEFAULT NULL,
  p_prompt_version    INTEGER DEFAULT 1,
  p_context_loaded    JSONB DEFAULT NULL,
  p_linear_issue_id   TEXT DEFAULT NULL,
  p_linear_issue_url  TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_run_id UUID;
BEGIN
  INSERT INTO public.agent_run_memory (
    agent_handle, task_type, success, error_type, error_message,
    auto_fix_applied, auto_fix_success, result_summary, learned_this_run,
    prompt_version_used, context_loaded, linear_issue_id, linear_issue_url
  ) VALUES (
    p_agent_handle, p_task_type, p_success, p_error_type, p_error_message,
    p_auto_fix_applied, p_auto_fix_success, p_result_summary, p_learned_this_run,
    p_prompt_version, p_context_loaded, p_linear_issue_id, p_linear_issue_url
  )
  RETURNING id INTO v_run_id;

  -- Update fix library if a fix was applied
  IF p_auto_fix_applied IS NOT NULL THEN
    INSERT INTO public.agent_fix_library (
      agent_handle, error_signature, error_type, fix_strategy,
      success_count, failure_count, last_used_at
    ) VALUES (
      p_agent_handle,
      COALESCE(p_error_type, 'unknown') || ':' || LEFT(COALESCE(p_error_message, ''), 100),
      COALESCE(p_error_type, 'unknown'),
      p_auto_fix_applied,
      CASE WHEN p_auto_fix_success THEN 1 ELSE 0 END,
      CASE WHEN NOT p_auto_fix_success THEN 1 ELSE 0 END,
      now()
    )
    ON CONFLICT (agent_handle, error_signature)
    DO UPDATE SET
      success_count = agent_fix_library.success_count + CASE WHEN p_auto_fix_success THEN 1 ELSE 0 END,
      failure_count = agent_fix_library.failure_count + CASE WHEN NOT p_auto_fix_success THEN 1 ELSE 0 END,
      last_used_at  = now();
  END IF;

  -- Update skill_registry prompt version if learned something new
  IF p_learned_this_run IS NOT NULL AND jsonb_typeof(p_learned_this_run) = 'object' 
     AND p_learned_this_run != '{}'::jsonb THEN
    UPDATE public.skill_registry
    SET
      improvement_notes   = COALESCE(improvement_notes, '') || E'\n[' || to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' || 
                            COALESCE(p_learned_this_run->>'summary', 'Run completed'),
      last_prompt_update  = now()
    WHERE name = p_agent_handle;
  END IF;

  RETURN v_run_id;
END;
$$;

-- RPC: update_agent_prompt
-- Layer 2: called when agent decides to rewrite its own instructions
CREATE OR REPLACE FUNCTION public.update_agent_prompt(
  p_agent_handle       TEXT,
  p_new_description    TEXT,
  p_new_triggers       TEXT,
  p_new_auto_fix_rules JSONB DEFAULT NULL,
  p_improvement_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_old_version   INTEGER;
  v_new_version   INTEGER;
  v_old_desc      TEXT;
  v_old_triggers  TEXT;
BEGIN
  SELECT prompt_version, description, triggers
  INTO v_old_version, v_old_desc, v_old_triggers
  FROM public.skill_registry
  WHERE name = p_agent_handle;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent not found in skill_registry');
  END IF;

  v_new_version := COALESCE(v_old_version, 1) + 1;

  UPDATE public.skill_registry
  SET
    description         = p_new_description,
    triggers            = p_new_triggers,
    auto_fix_rules      = COALESCE(p_new_auto_fix_rules, auto_fix_rules),
    prompt_version      = v_new_version,
    last_prompt_update  = now(),
    improvement_notes   = COALESCE(improvement_notes, '') || E'\n[v' || v_new_version || ' @ ' || 
                          to_char(now(), 'YYYY-MM-DD HH24:MI') || '] ' || 
                          COALESCE(p_improvement_reason, 'Self-update'),
    prompt_history      = COALESCE(prompt_history, '[]'::jsonb) || jsonb_build_object(
                            'version',     v_old_version,
                            'description', v_old_desc,
                            'triggers',    v_old_triggers,
                            'archived_at', now()
                          )
  WHERE name = p_agent_handle;

  RETURN jsonb_build_object(
    'success',      true,
    'agent',        p_agent_handle,
    'old_version',  v_old_version,
    'new_version',  v_new_version
  );
END;
$$;

-- Enable RLS on new tables
ALTER TABLE public.agent_run_memory   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_fix_library  ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "service_role_all_arm" ON public.agent_run_memory
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_afl" ON public.agent_fix_library
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE public.agent_run_memory IS 'Layer 3: Persistent memory for all self-improving agent runs';
COMMENT ON TABLE public.agent_fix_library IS 'Layer 1: Accumulated library of auto-fixes that have worked';
COMMENT ON FUNCTION public.get_agent_memory IS 'Load full memory context for an agent before its run';
COMMENT ON FUNCTION public.log_agent_run IS 'Persist run results and learnings after each agent execution';
COMMENT ON FUNCTION public.update_agent_prompt IS 'Layer 2: Agent rewrites its own skill_registry entry';
;
