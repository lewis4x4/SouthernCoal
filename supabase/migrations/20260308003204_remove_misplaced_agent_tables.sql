
-- Remove agent self-improvement tables that were accidentally added to Southern Coal
-- These belong in the Jarvis database, not here

DROP TABLE IF EXISTS public.agent_run_memory;
DROP TABLE IF EXISTS public.agent_fix_library;

-- Remove the 3 RPCs
DROP FUNCTION IF EXISTS public.get_agent_memory(TEXT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.log_agent_run(TEXT, TEXT, BOOLEAN, JSONB, TEXT, TEXT, TEXT, BOOLEAN, JSONB, INTEGER, JSONB, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_agent_prompt(TEXT, TEXT, TEXT, JSONB, TEXT);

-- Remove columns added to skill_registry and skill_execution_log
-- (only if they exist — these tables pre-existed in Southern Coal)
ALTER TABLE public.skill_registry
  DROP COLUMN IF EXISTS self_improve_enabled,
  DROP COLUMN IF EXISTS auto_fix_rules,
  DROP COLUMN IF EXISTS prompt_version,
  DROP COLUMN IF EXISTS prompt_history,
  DROP COLUMN IF EXISTS failure_count_24h,
  DROP COLUMN IF EXISTS last_prompt_update,
  DROP COLUMN IF EXISTS improvement_notes;

ALTER TABLE public.skill_execution_log
  DROP COLUMN IF EXISTS memory_context,
  DROP COLUMN IF EXISTS learned_patterns,
  DROP COLUMN IF EXISTS auto_fix_applied,
  DROP COLUMN IF EXISTS auto_fix_success,
  DROP COLUMN IF EXISTS prompt_version,
  DROP COLUMN IF EXISTS run_quality_score,
  DROP COLUMN IF EXISTS escalated_to_linear,
  DROP COLUMN IF EXISTS linear_issue_id;
;
