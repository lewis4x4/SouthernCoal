-- Lane C QW4: harden field-gear PM detector SECURITY DEFINER RPCs.
--
-- The work-order opener is an internal helper reached through
-- detect_equipment_maintenance_gaps(). Keep direct execute service-only, and
-- enforce scoped organization resolution inside both mutating functions.

CREATE OR REPLACE FUNCTION public.open_equipment_maintenance_with_work_order(
  p_organization_id uuid,
  p_equipment_id uuid,
  p_equipment_name text,
  p_next_due date,
  p_days_until integer,
  p_urgency text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert_id uuid;
  v_wo_id uuid;
  v_priority text;
BEGIN
  PERFORM resolve_scoped_org_id(p_organization_id);

  IF NOT EXISTS (
    SELECT 1
    FROM equipment_catalog ec
    WHERE ec.id = p_equipment_id
      AND ec.organization_id = p_organization_id
      AND ec.is_active = true
  ) THEN
    RAISE EXCEPTION 'Equipment not found or not accessible';
  END IF;

  SELECT id INTO v_alert_id
  FROM equipment_maintenance_alerts
  WHERE equipment_id = p_equipment_id
    AND review_status = 'pending'
  LIMIT 1;

  IF v_alert_id IS NOT NULL THEN
    RETURN v_alert_id;
  END IF;

  v_priority := CASE p_urgency
    WHEN 'overdue' THEN 'high'
    WHEN 'due_soon' THEN 'medium'
    ELSE 'low'
  END;

  INSERT INTO work_orders (
    organization_id,
    source_type,
    title,
    description,
    priority,
    status,
    due_date,
    category
  ) VALUES (
    p_organization_id,
    'equipment_maintenance',
    format('Field gear PM %s: %s', p_urgency, p_equipment_name),
    format(
      'Auto-opened from equipment PM detector. Next due: %s. Review overdue gear list.',
      COALESCE(p_next_due::text, 'unknown')
    ),
    v_priority,
    'open',
    COALESCE(p_next_due, CURRENT_DATE + 7),
    'equipment_repair'
  )
  RETURNING id INTO v_wo_id;

  INSERT INTO work_order_events (work_order_id, event_type, new_value, notes)
  VALUES (v_wo_id, 'created', 'open', 'Opened by equipment PM detector (QW4)');

  INSERT INTO equipment_maintenance_alerts (
    organization_id,
    equipment_id,
    equipment_name,
    next_maintenance_due,
    days_until_due,
    urgency,
    work_order_id,
    valid_from,
    transaction_time
  ) VALUES (
    p_organization_id,
    p_equipment_id,
    p_equipment_name,
    p_next_due,
    p_days_until,
    p_urgency,
    v_wo_id,
    now(),
    now()
  )
  RETURNING id INTO v_alert_id;

  UPDATE work_orders SET source_id = v_alert_id WHERE id = v_wo_id;

  RETURN v_alert_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_equipment_maintenance_with_work_order(
  uuid, uuid, text, date, integer, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_equipment_maintenance_with_work_order(
  uuid, uuid, text, date, integer, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.open_equipment_maintenance_with_work_order(
  uuid, uuid, text, date, integer, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.detect_equipment_maintenance_gaps(
  p_organization_id uuid,
  p_within_days integer DEFAULT 14,
  p_source text DEFAULT 'scheduled'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := resolve_scoped_org_id(p_organization_id);
  v_opened integer := 0;
  v_existing_alert_id uuid;
  rec RECORD;
  v_urgency text;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization context is required';
  END IF;

  FOR rec IN
    SELECT * FROM get_equipment_due_maintenance(v_org_id, p_within_days)
  LOOP
    v_urgency := CASE
      WHEN rec.next_maintenance_due IS NULL THEN 'unknown'
      WHEN rec.days_until_due < 0 THEN 'overdue'
      ELSE 'due_soon'
    END;

    SELECT id INTO v_existing_alert_id
    FROM equipment_maintenance_alerts
    WHERE equipment_id = rec.equipment_id
      AND review_status = 'pending'
    LIMIT 1;

    PERFORM open_equipment_maintenance_with_work_order(
      v_org_id,
      rec.equipment_id,
      rec.equipment_name,
      rec.next_maintenance_due,
      rec.days_until_due,
      v_urgency
    );

    IF v_existing_alert_id IS NULL THEN
      v_opened := v_opened + 1;
    END IF;
  END LOOP;

  INSERT INTO audit_log (
    organization_id, action, module, table_name, new_values, description
  ) VALUES (
    v_org_id,
    'equipment_maintenance_detection_completed',
    'environmental_compliance',
    'equipment_maintenance_alerts',
    jsonb_build_object('opened', v_opened, 'source', p_source),
    'Field gear PM overdue detection (QW4)'
  );

  RETURN jsonb_build_object('organization_id', v_org_id, 'opened', v_opened);
END;
$$;

REVOKE ALL ON FUNCTION public.detect_equipment_maintenance_gaps(
  uuid, integer, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_equipment_maintenance_gaps(
  uuid, integer, text
) TO authenticated, service_role;
