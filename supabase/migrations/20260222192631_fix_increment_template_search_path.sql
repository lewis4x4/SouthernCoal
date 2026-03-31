-- Fix search_path on increment_template_run_count (security advisory)
CREATE OR REPLACE FUNCTION increment_template_run_count(template_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE report_templates
  SET run_count = run_count + 1, last_run_at = now(), updated_at = now()
  WHERE id = template_id;
END;
$$;;
