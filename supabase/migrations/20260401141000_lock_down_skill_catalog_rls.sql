BEGIN;

DROP POLICY IF EXISTS sender_trust_all ON public.email_sender_trust;
DROP POLICY IF EXISTS skill_registry_all ON public.skill_registry;
DROP POLICY IF EXISTS skill_exec_log_all ON public.skill_execution_log;
DROP POLICY IF EXISTS skill_feedback_all ON public.skill_feedback;

CREATE POLICY "Service role manages email sender trust"
  ON public.email_sender_trust
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages skill registry"
  ON public.skill_registry
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages skill execution log"
  ON public.skill_execution_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages skill feedback"
  ON public.skill_feedback
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
