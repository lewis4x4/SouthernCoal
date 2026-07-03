-- Counterparty Graph Slice A, Part 1: governed party taxonomy.
-- Global lookup tables: authenticated users can read; writes are migration/service-role only.

CREATE TABLE IF NOT EXISTS public.party_role_types (
  code text PRIMARY KEY,
  display_label text NOT NULL,
  category text NOT NULL
    CHECK (category IN (
      'internal', 'regulator', 'commercial', 'legal', 'financial', 'community'
    )),
  statutory_basis text,
  is_active boolean NOT NULL DEFAULT true,
  deprecated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.party_relationship_types (
  code text PRIMARY KEY,
  display_label text NOT NULL,
  is_directed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.party_role_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_relationship_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read party role types"
  ON public.party_role_types;
CREATE POLICY "Authenticated users can read party role types"
  ON public.party_role_types
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role manages party role types"
  ON public.party_role_types;
CREATE POLICY "Service role manages party role types"
  ON public.party_role_types
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read party relationship types"
  ON public.party_relationship_types;
CREATE POLICY "Authenticated users can read party relationship types"
  ON public.party_relationship_types
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role manages party relationship types"
  ON public.party_relationship_types;
CREATE POLICY "Service role manages party relationship types"
  ON public.party_relationship_types
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.party_role_types (code, display_label, category, statutory_basis) VALUES
  ('employee', 'Employee', 'internal', NULL),
  ('certified_examiner', 'Certified Examiner', 'internal', NULL),
  ('regulator_staff', 'Regulator Staff', 'regulator', NULL),
  ('agency', 'Agency', 'regulator', NULL),
  ('counsel', 'Counsel', 'legal', NULL),
  ('legal_counsel', 'Legal Counsel', 'legal', NULL),
  ('surety', 'Surety', 'financial', NULL),
  ('insurer', 'Insurer', 'financial', NULL),
  ('lender', 'Lender', 'financial', NULL),
  ('lab', 'Laboratory', 'commercial', NULL),
  ('vendor', 'Vendor', 'commercial', NULL),
  ('royalty_owner', 'Royalty Owner', 'financial', NULL),
  ('lessor', 'Lessor', 'financial', NULL),
  ('contractor', 'Contractor', 'commercial', NULL),
  ('community_member', 'Community Member', 'community', NULL),
  ('elected_official', 'Elected Official', 'community', NULL),
  ('doj_monitor', 'DOJ Monitor', 'regulator', NULL),
  ('epa_coordinator', 'EPA Coordinator', 'regulator', NULL),
  ('state_dep_contact', 'State DEP Contact', 'regulator', NULL),
  ('environmental_consultant', 'Environmental Consultant', 'commercial', NULL),
  ('lab_contact', 'Laboratory Contact', 'commercial', NULL),
  ('site_manager', 'Site Manager', 'internal', NULL),
  ('safety_officer', 'Safety Officer', 'internal', NULL),
  ('emergency_responder', 'Emergency Responder', 'community', NULL),
  ('regulatory_liaison', 'Regulatory Liaison', 'regulator', NULL),
  ('media_contact', 'Media Contact', 'community', NULL),
  ('other', 'Other', 'community', NULL)
ON CONFLICT (code) DO UPDATE SET
  display_label = EXCLUDED.display_label,
  category = EXCLUDED.category,
  statutory_basis = EXCLUDED.statutory_basis;

INSERT INTO public.party_relationship_types (code, display_label, is_directed) VALUES
  ('employs', 'Employs', true),
  ('represents', 'Represents', true),
  ('regulates', 'Regulates', true),
  ('contracts_with', 'Contracts With', false),
  ('owns_or_controls', 'Owns or Controls', true),
  ('registered_agent_for', 'Registered Agent For', true),
  ('surety_for', 'Surety For', true),
  ('counsel_for', 'Counsel For', true),
  ('same_as', 'Same As', false)
ON CONFLICT (code) DO UPDATE SET
  display_label = EXCLUDED.display_label,
  is_directed = EXCLUDED.is_directed;
