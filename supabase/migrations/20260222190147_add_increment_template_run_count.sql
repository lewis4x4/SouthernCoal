-- Atomic increment for report_templates.run_count + update last_run_at
CREATE OR REPLACE FUNCTION increment_template_run_count(template_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE report_templates
  SET run_count = run_count + 1,
      last_run_at = now(),
      updated_at = now()
  WHERE id = template_id;
END;
$$;;
