-- Slice 1 — resolve internal permit by registry number OR metadata federal_npdes_id_override.

CREATE OR REPLACE FUNCTION public.resolve_npdes_permit_id_for_echo(
  p_organization_id uuid,
  p_echo_npdes_id text
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p.id
  FROM npdes_permits p
  WHERE p.organization_id = p_organization_id
    AND (
      upper(p.permit_number) = upper(p_echo_npdes_id)
      OR upper(
        coalesce(nullif(trim(p.metadata->>'federal_npdes_id_override'), ''), '')
      ) = upper(p_echo_npdes_id)
    )
  ORDER BY
    CASE WHEN upper(p.permit_number) = upper(p_echo_npdes_id) THEN 0 ELSE 1 END,
    p.created_at
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_npdes_permit_id_for_echo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_npdes_permit_id_for_echo(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_npdes_permit_id_for_echo(uuid, text) TO authenticated;
