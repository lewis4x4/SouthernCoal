
-- Fix: o.npdes_permit_id → o.permit_id (column doesn't exist as npdes_permit_id)
CREATE OR REPLACE FUNCTION public.auto_create_ca_from_exceedance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_site_name text;
  v_state text;
  v_param_name text;
BEGIN
  -- Resolve org through outfall chain
  SELECT s.organization_id, s.name, st.code
  INTO v_org_id, v_site_name, v_state
  FROM public.outfalls o
  JOIN public.npdes_permits np ON o.permit_id = np.id
  JOIN public.sites s ON np.site_id = s.id
  LEFT JOIN public.states st ON s.state_id = st.id
  WHERE o.id = NEW.outfall_id;

  -- Log and exit gracefully if chain broken
  IF v_org_id IS NULL THEN
    RAISE WARNING '[CA Trigger] Could not resolve org for exceedance % (outfall_id: %)', NEW.id, NEW.outfall_id;
    RETURN NEW;
  END IF;

  -- Get parameter name
  SELECT name INTO v_param_name FROM public.parameters WHERE id = NEW.parameter_id;

  -- Create CA
  INSERT INTO public.corrective_actions (
    organization_id, source_type, source_id, title, description,
    date_received, priority, due_date, state, workflow_step, status
  ) VALUES (
    v_org_id, 'exceedance', NEW.id,
    format('Exceedance: %s at %s', COALESCE(v_param_name, 'Parameter'), v_site_name),
    format('Permit limit exceeded for %s. Result: %s, Limit: %s',
           COALESCE(v_param_name, 'parameter'), NEW.result_value, NEW.limit_value),
    CURRENT_DATE, 'high', (CURRENT_DATE + INTERVAL '7 days')::date,
    v_state, 'identification', 'open'
  );

  RETURN NEW;
END;
$$;
;
