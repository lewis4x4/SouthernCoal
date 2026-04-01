BEGIN;

CREATE OR REPLACE FUNCTION public.validate_field_visit_relationships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  permit_org_id uuid;
  outfall_permit_id uuid;
  assigned_org_id uuid;
  calendar_org_id uuid;
  calendar_outfall_id uuid;
  calendar_scheduled_date date;
BEGIN
  SELECT organization_id
  INTO permit_org_id
  FROM public.npdes_permits
  WHERE id = NEW.permit_id;

  IF permit_org_id IS NULL THEN
    RAISE EXCEPTION 'Permit % was not found', NEW.permit_id;
  END IF;

  IF permit_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Permit % does not belong to organization %', NEW.permit_id, NEW.organization_id;
  END IF;

  SELECT permit_id
  INTO outfall_permit_id
  FROM public.outfalls
  WHERE id = NEW.outfall_id;

  IF outfall_permit_id IS NULL THEN
    RAISE EXCEPTION 'Outfall % was not found', NEW.outfall_id;
  END IF;

  IF outfall_permit_id <> NEW.permit_id THEN
    RAISE EXCEPTION 'Outfall % does not belong to permit %', NEW.outfall_id, NEW.permit_id;
  END IF;

  SELECT organization_id
  INTO assigned_org_id
  FROM public.user_profiles
  WHERE id = NEW.assigned_to;

  IF assigned_org_id IS NULL THEN
    RAISE EXCEPTION 'Assigned user % was not found', NEW.assigned_to;
  END IF;

  IF assigned_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Assigned user % does not belong to organization %', NEW.assigned_to, NEW.organization_id;
  END IF;

  IF NEW.sampling_calendar_id IS NOT NULL THEN
    SELECT organization_id, outfall_id, scheduled_date
    INTO calendar_org_id, calendar_outfall_id, calendar_scheduled_date
    FROM public.sampling_calendar
    WHERE id = NEW.sampling_calendar_id;

    IF calendar_org_id IS NULL THEN
      RAISE EXCEPTION 'Sampling calendar item % was not found', NEW.sampling_calendar_id;
    END IF;

    IF calendar_org_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'Sampling calendar item % does not belong to organization %', NEW.sampling_calendar_id, NEW.organization_id;
    END IF;

    IF calendar_outfall_id <> NEW.outfall_id THEN
      RAISE EXCEPTION 'Sampling calendar item % does not belong to outfall %', NEW.sampling_calendar_id, NEW.outfall_id;
    END IF;

    IF calendar_scheduled_date <> NEW.scheduled_date THEN
      RAISE EXCEPTION 'Field visit scheduled date % must match sampling calendar date %', NEW.scheduled_date, calendar_scheduled_date;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.outfalls
SET site_id = 'f0000002-0002-4002-8002-000000000002'::uuid
WHERE id IN (
  'f0000004-0004-4004-8004-000000000001'::uuid,
  'f0000004-0004-4004-8004-000000000002'::uuid,
  'f0000004-0004-4004-8004-000000000003'::uuid
)
  AND site_id IS NULL;

COMMIT;
