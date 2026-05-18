-- GST-25: Distinguish admin "investigate" from confirmed "expired" on npdes_permits.
-- administratively_continued: null = unreviewed, true = continued, false = not continued.
-- requires_administrative_investigation: true only when disposition is "investigate".

ALTER TABLE public.npdes_permits
  ADD COLUMN IF NOT EXISTS requires_administrative_investigation boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.npdes_permits.requires_administrative_investigation IS
  'True when an admin marked the permit as needing investigation (distinct from confirmed expired).';

CREATE INDEX IF NOT EXISTS idx_npdes_permits_requires_admin_investigation
  ON public.npdes_permits (organization_id)
  WHERE requires_administrative_investigation = true;
