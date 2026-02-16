-- =============================================================================
-- Migration 004: Auto-create triggers for corrective_actions
-- =============================================================================
-- Creates CAs automatically when exceedances or enforcement actions are inserted
-- =============================================================================

-- =========================================================================
-- TRIGGER 1: Auto-create CA from exceedances
-- =========================================================================
-- Exceedances don't have organization_id directly, must resolve through:
-- exceedance → outfall → npdes_permit → site → organization
-- =========================================================================

CREATE OR REPLACE FUNCTION auto_create_ca_from_exceedance()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id uuid;
  v_site_id uuid;
  v_permit_id uuid;
  v_permit_number text;
  v_param_name text;
  v_outfall_name text;
  v_state text;
BEGIN
  -- Resolve organization and related info through the outfall chain
  SELECT
    s.organization_id,
    s.id,
    np.id,
    np.permit_number,
    p.display_name,
    o.outfall_id_display,
    st.code
  INTO
    v_org_id,
    v_site_id,
    v_permit_id,
    v_permit_number,
    v_param_name,
    v_outfall_name,
    v_state
  FROM outfalls o
  JOIN npdes_permits np ON o.npdes_permit_id = np.id
  JOIN sites s ON np.site_id = s.id
  JOIN states st ON s.state_id = st.id
  LEFT JOIN parameters p ON p.id = NEW.parameter_id
  WHERE o.id = NEW.outfall_id;

  -- Only create CA if we resolved the org
  IF v_org_id IS NULL THEN
    RAISE WARNING 'Could not resolve organization for exceedance %', NEW.id;
    RETURN NEW;
  END IF;

  -- Map severity to priority
  -- minor → low, moderate → medium, major → high, critical → critical
  INSERT INTO corrective_actions (
    organization_id,
    site_id,
    npdes_permit_id,
    state,
    source_type,
    source_id,
    title,
    description,
    priority,
    status,
    workflow_step,
    due_date,
    date_received,
    created_at,
    updated_at
  ) VALUES (
    v_org_id,
    v_site_id,
    v_permit_id,
    v_state,
    'exceedance',
    NEW.id,
    format('Exceedance: %s at Outfall %s (%s) - %s',
           COALESCE(v_param_name, 'Unknown parameter'),
           COALESCE(v_outfall_name, 'Unknown'),
           COALESCE(v_permit_number, 'No permit'),
           NEW.sample_date),
    format('Parameter %s exceeded %s limit. Result: %s %s, Limit: %s %s. Sample date: %s.',
           COALESCE(v_param_name, 'Unknown'),
           COALESCE(NEW.limit_type, 'unknown'),
           NEW.result_value,
           COALESCE(NEW.unit, ''),
           NEW.limit_value,
           COALESCE(NEW.unit, ''),
           NEW.sample_date),
    CASE NEW.severity
      WHEN 'critical' THEN 'critical'
      WHEN 'major' THEN 'high'
      WHEN 'moderate' THEN 'medium'
      ELSE 'low'
    END,
    'open',
    'identification',
    -- Due date: 5 business days from now for initial response
    (CURRENT_DATE + INTERVAL '7 days')::date,
    NEW.sample_date,
    now(),
    now()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on exceedances
DROP TRIGGER IF EXISTS trg_exceedance_creates_ca ON exceedances;
CREATE TRIGGER trg_exceedance_creates_ca
  AFTER INSERT ON exceedances
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_ca_from_exceedance();


-- =========================================================================
-- TRIGGER 2: Auto-create CA from enforcement_actions
-- =========================================================================
-- Only for NOV and order types that require corrective action response
-- =========================================================================

CREATE OR REPLACE FUNCTION auto_create_ca_from_enforcement()
RETURNS TRIGGER AS $$
DECLARE
  v_site_name text;
  v_state text;
BEGIN
  -- Only trigger for enforcement types that require CA response
  IF NEW.action_type NOT IN (
    'notice_of_violation',
    'notice_of_non_compliance',
    'cessation_order',
    'consent_order',
    'show_cause_order'
  ) THEN
    RETURN NEW;
  END IF;

  -- Get site name and state for title
  SELECT s.name, st.code
  INTO v_site_name, v_state
  FROM sites s
  LEFT JOIN states st ON s.state_id = st.id
  WHERE s.id = NEW.site_id;

  INSERT INTO corrective_actions (
    organization_id,
    site_id,
    npdes_permit_id,
    state,
    source_type,
    source_id,
    title,
    description,
    date_issued,
    issuing_agency,
    priority,
    status,
    workflow_step,
    due_date,
    date_received,
    created_at,
    updated_at
  ) VALUES (
    NEW.organization_id,
    NEW.site_id,
    NEW.related_permit_id,
    v_state,
    'enforcement',
    NEW.id,
    format('%s: %s - %s (%s)',
           UPPER(REPLACE(NEW.action_type, '_', ' ')),
           COALESCE(NEW.reference_number, 'No ref'),
           COALESCE(NEW.issuing_agency, 'Unknown agency'),
           COALESCE(v_site_name, 'Unknown site')),
    NEW.description,
    NEW.issued_date,
    NEW.issuing_agency,
    -- NOVs and orders are high/critical priority
    CASE
      WHEN NEW.action_type IN ('cessation_order', 'show_cause_order') THEN 'critical'
      WHEN NEW.action_type = 'consent_order' THEN 'high'
      ELSE 'high'
    END,
    'open',
    'identification',
    -- Use response_due_date if set, otherwise 10 days
    COALESCE(NEW.response_due_date, (CURRENT_DATE + INTERVAL '10 days')::date),
    NEW.issued_date,
    now(),
    now()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on enforcement_actions
DROP TRIGGER IF EXISTS trg_enforcement_creates_ca ON enforcement_actions;
CREATE TRIGGER trg_enforcement_creates_ca
  AFTER INSERT ON enforcement_actions
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_ca_from_enforcement();


-- =========================================================================
-- VERIFICATION
-- =========================================================================
-- SELECT tgname, tgrelid::regclass FROM pg_trigger
--   WHERE tgname LIKE 'trg_%_creates_ca';
-- SELECT proname FROM pg_proc
--   WHERE proname LIKE 'auto_create_ca_%';
