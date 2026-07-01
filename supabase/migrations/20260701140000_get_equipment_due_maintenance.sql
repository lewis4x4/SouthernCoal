-- Lane C QW4: Overdue field-sampling gear maintenance detector

CREATE INDEX IF NOT EXISTS idx_maintenance_logs_due
  ON maintenance_logs(next_maintenance_due)
  WHERE next_maintenance_due IS NOT NULL;

CREATE OR REPLACE FUNCTION get_equipment_due_maintenance(
  p_org_id uuid,
  p_within_days integer DEFAULT 14
) RETURNS TABLE (
  equipment_id uuid,
  equipment_name text,
  equipment_type text,
  serial_number text,
  last_serviced_at timestamptz,
  next_maintenance_due date,
  days_until_due integer,
  assigned_to_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org uuid;
BEGIN
  v_caller_org := get_user_org_id();

  IF p_org_id != v_caller_org THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    ec.id AS equipment_id,
    ec.name AS equipment_name,
    ec.equipment_type,
    ec.serial_number,
    ml.performed_at AS last_serviced_at,
    ml.next_maintenance_due,
    (ml.next_maintenance_due - CURRENT_DATE)::integer AS days_until_due,
    COALESCE(up.first_name || ' ' || up.last_name, up.email) AS assigned_to_name
  FROM equipment_catalog ec
  LEFT JOIN LATERAL (
    SELECT ml2.performed_at, ml2.next_maintenance_due
    FROM maintenance_logs ml2
    WHERE ml2.equipment_id = ec.id
    ORDER BY ml2.performed_at DESC
    LIMIT 1
  ) ml ON true
  LEFT JOIN equipment_assignments ea
    ON ea.equipment_id = ec.id AND ea.returned_at IS NULL
  LEFT JOIN user_profiles up ON up.id = ea.assigned_to
  WHERE ec.organization_id = p_org_id
    AND ec.is_active = true
    AND (
      ml.next_maintenance_due IS NULL
      OR ml.next_maintenance_due <= CURRENT_DATE + p_within_days
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_equipment_due_maintenance(uuid, integer) TO authenticated;

COMMENT ON FUNCTION get_equipment_due_maintenance IS
  'Field-sampling gear due or overdue for PM (Lane C QW4). Clones calibration due pattern against maintenance_logs.';
