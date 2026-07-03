#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL_BIN="${PSQL_BIN:-psql}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
CONTAINER_NAME="scc-counterparty-slice-a-proof-$$"
TMP_DIR="$(mktemp -d)"

cleanup() {
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

command -v docker >/dev/null
command -v "${PSQL_BIN}" >/dev/null

echo "[PROOF] starting disposable Postgres for Counterparty Graph Slice A"
docker run --rm -d \
  --name "${CONTAINER_NAME}" \
  -e POSTGRES_PASSWORD=postgres \
  -p 127.0.0.1::5432 \
  "${POSTGRES_IMAGE}" >/dev/null

HOST_PORT=""
for _ in {1..60}; do
  HOST_PORT="$(docker port "${CONTAINER_NAME}" 5432/tcp 2>/dev/null | sed -E 's/.*:([0-9]+)$/\1/' || true)"
  if [[ -n "${HOST_PORT}" ]] && PGPASSWORD=postgres "${PSQL_BIN}" "postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/postgres" -v ON_ERROR_STOP=1 -qAt -c "SELECT 1" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if [[ -z "${HOST_PORT}" ]]; then
  echo "[PROOF FAIL] disposable Postgres did not publish a port" >&2
  exit 1
fi

DB_URL="postgresql://postgres:postgres@127.0.0.1:${HOST_PORT}/postgres"
BASELINE_SQL="${TMP_DIR}/baseline.sql"
PROOF_SQL="${TMP_DIR}/proof.sql"

cat > "${BASELINE_SQL}" <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT EXECUTE ON FUNCTIONS TO authenticated;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  org_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id),
  email text NOT NULL,
  first_name text,
  last_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_role_assignments (
  user_id uuid NOT NULL REFERENCES public.user_profiles(id),
  role_id uuid NOT NULL REFERENCES public.roles(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL
);

CREATE TABLE public.npdes_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  permit_number text NOT NULL
);

CREATE TABLE public.emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  site_id uuid REFERENCES public.sites(id),
  contact_name text NOT NULL,
  contact_role text NOT NULL,
  email text,
  phone_primary text,
  phone_secondary text,
  organization_name text,
  state_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.msha_subsidiary_org (
  organization_id uuid NOT NULL REFERENCES public.organizations(id)
);

CREATE TABLE public.msha_mine_org_map (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  mine_id text NOT NULL,
  controller_id text,
  operator_name text,
  mine_name text,
  state text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'proof'
);

CREATE TABLE public.msha_controller_allowlist (
  controller_id text PRIMARY KEY,
  controller_name text NOT NULL
);

INSERT INTO public.roles(name) VALUES ('admin'), ('executive'), ('environmental_manager'), ('site_manager');

INSERT INTO public.organizations(id, name, legal_name, org_type, created_at)
SELECT
  ('10000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'Proof Org ' || n,
  'Proof Org ' || n || ' LLC',
  CASE WHEN n = 1 THEN 'parent' ELSE 'subsidiary' END,
  now() + make_interval(secs => n)
FROM generate_series(1, 27) AS n;

INSERT INTO public.user_profiles(id, organization_id, email, first_name, last_name)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  '10000000-0000-0000-0000-000000000001',
  'proof-admin@example.test',
  'Proof',
  'Admin'
);

INSERT INTO public.user_role_assignments(user_id, role_id)
SELECT '11111111-1111-1111-1111-111111111111', id
FROM public.roles
WHERE name = 'admin';

INSERT INTO public.msha_subsidiary_org(organization_id)
SELECT id FROM public.organizations;

INSERT INTO public.msha_mine_org_map(organization_id, mine_id, controller_id, operator_name, mine_name, state)
SELECT
  id,
  'MINE-' || row_number() OVER (ORDER BY id),
  'CTRL-' || row_number() OVER (ORDER BY id),
  name,
  name || ' Mine',
  'WV'
FROM public.organizations;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT up.organization_id
  FROM public.user_profiles up
  WHERE up.id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_org_id() TO authenticated, service_role;
SQL

cat > "${PROOF_SQL}" <<'SQL'
CREATE OR REPLACE FUNCTION public.expect_error(p_label text, p_sql text, p_expected text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_message text;
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION '%: expected an error containing "%"', p_label, p_expected;
EXCEPTION WHEN others THEN
  GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;

  IF position(p_expected in v_message) = 0 THEN
    RAISE EXCEPTION '%: expected error containing "%", got "%"', p_label, p_expected, v_message;
  END IF;

  RAISE NOTICE '[PROOF PASS] % -> %', p_label, v_message;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expect_error(text, text, text) TO authenticated;

DO $$
DECLARE
  v_expected integer;
  v_actual integer;
BEGIN
  SELECT COUNT(DISTINCT organization_id)
  INTO v_expected
  FROM public.msha_subsidiary_org;

  SELECT COUNT(*)
  INTO v_actual
  FROM public.msha_subsidiary_org m
  JOIN public.organizations o ON o.id = m.organization_id
  JOIN public.parties p ON p.id = o.party_id
  WHERE p.party_kind = 'organization'
    AND p.organization_id = o.id
    AND p.is_shared_reference = false;

  IF v_expected <> 27 OR v_actual <> 27 THEN
    RAISE EXCEPTION 'organizations.party_id bridge expected 27/27, got %/%', v_actual, v_expected;
  END IF;

  RAISE NOTICE '[PROOF PASS] organizations.party_id bridge = %/%', v_actual, v_expected;
END;
$$;

SELECT public.expect_error(
  'parties_tenancy_invariant rejects private NULL org',
  $$INSERT INTO public.parties(party_kind, display_name, organization_id, is_shared_reference)
    VALUES ('person', 'Invalid Private Party', NULL, false)$$,
  'parties_tenancy_invariant'
);

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{}}';
SELECT public.expect_error(
  'tenant cannot write shared-reference party',
  $$INSERT INTO public.parties(party_kind, display_name, organization_id, is_shared_reference)
    VALUES ('organization', 'Tenant Forged Shared Party', NULL, true)$$,
  'new row violates row-level security policy'
);
COMMIT;

INSERT INTO public.parties(id, party_kind, display_name, organization_id, is_shared_reference, external_ids)
VALUES
  ('22222222-2222-2222-2222-222222222221', 'organization', 'Proof Survivor', '10000000-0000-0000-0000-000000000001', false, '{"source_key":"proof:survivor"}'),
  ('22222222-2222-2222-2222-222222222222', 'organization', 'Proof Superseded', '10000000-0000-0000-0000-000000000001', false, '{"source_key":"proof:superseded"}'),
  ('22222222-2222-2222-2222-222222222223', 'organization', 'Proof Shared', NULL, true, '{"source_key":"proof:shared"}');

SELECT public.expect_error(
  'shared/private merge event rejected by trigger',
  $$INSERT INTO public.party_merge_events(surviving_party_id, superseded_party_id, organization_id, basis)
    VALUES ('22222222-2222-2222-2222-222222222223', '22222222-2222-2222-2222-222222222221', NULL, 'proof shared private rejection')$$,
  'Shared/private party merges are prohibited'
);

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{}}';
SELECT public.expect_error(
  'tenant direct party_merge_events insert denied',
  $$INSERT INTO public.party_merge_events(surviving_party_id, superseded_party_id, organization_id, merged_by, basis)
    VALUES ('22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'forged actor')$$,
  'permission denied'
);
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{}}';
SELECT public.apply_party_merge(
  '22222222-2222-2222-2222-222222222221',
  '22222222-2222-2222-2222-222222222222',
  'proof valid same-tenant private merge',
  1,
  NULL
);
COMMIT;

DO $$
DECLARE
  v_event public.party_merge_events%ROWTYPE;
  v_superseded_by uuid;
BEGIN
  SELECT *
  INTO v_event
  FROM public.party_merge_events
  WHERE superseded_party_id = '22222222-2222-2222-2222-222222222222';

  SELECT superseded_by
  INTO v_superseded_by
  FROM public.parties
  WHERE id = '22222222-2222-2222-2222-222222222222';

  IF v_event.merged_by <> '11111111-1111-1111-1111-111111111111' THEN
    RAISE EXCEPTION 'merge actor was not stamped from auth.uid(): %', v_event.merged_by;
  END IF;

  IF v_superseded_by <> '22222222-2222-2222-2222-222222222221' THEN
    RAISE EXCEPTION 'superseded party was not bridged to survivor: %', v_superseded_by;
  END IF;

  RAISE NOTICE '[PROOF PASS] same-tenant merge stamped merged_by and updated superseded_by';
END;
$$;

SELECT public.expect_error(
  'already merged party cannot be merged again',
  $$INSERT INTO public.party_merge_events(surviving_party_id, superseded_party_id, organization_id, basis)
    VALUES ('22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222', '10000000-0000-0000-0000-000000000001', 'proof duplicate merge')$$,
  'already merged'
);
SQL

echo "[PROOF] applying minimal baseline"
PGPASSWORD=postgres "${PSQL_BIN}" "${DB_URL}" -v ON_ERROR_STOP=1 -q -f "${BASELINE_SQL}"

echo "[PROOF] applying Slice A migrations"
for migration in \
  20260704020000_counterparty_party_taxonomy.sql \
  20260704021000_counterparty_parties.sql \
  20260704022000_counterparty_party_roles_relationships.sql \
  20260704023000_counterparty_party_merge_events.sql \
  20260704024000_counterparty_org_party_bridge.sql \
  20260704025000_counterparty_fold_in_seeds.sql
do
  echo "[PROOF] applying ${migration}"
  PGPASSWORD=postgres "${PSQL_BIN}" "${DB_URL}" -v ON_ERROR_STOP=1 -q -f "${ROOT_DIR}/supabase/migrations/${migration}"
done

echo "[PROOF] running runtime assertions"
PGPASSWORD=postgres "${PSQL_BIN}" "${DB_URL}" -v ON_ERROR_STOP=1 -f "${PROOF_SQL}"

echo "[COUNTERPARTY SLICE A MIGRATION PROOF PASS]"
