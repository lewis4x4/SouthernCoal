-- Slice 6 — VA NPDES manual override: structured confirmation basis (task 3.38)

ALTER TABLE public.npdes_id_overrides
  ADD COLUMN IF NOT EXISTS confirmation_basis text,
  ADD COLUMN IF NOT EXISTS confirmation_reference text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

ALTER TABLE public.npdes_id_overrides
  DROP CONSTRAINT IF EXISTS npdes_id_overrides_confirmation_basis_check;

ALTER TABLE public.npdes_id_overrides
  ADD CONSTRAINT npdes_id_overrides_confirmation_basis_check
  CHECK (
    confirmation_basis IS NULL
    OR confirmation_basis IN (
      'vpdes_pdf',
      'va_deq_ceds',
      'cd_attachment_f',
      'operator_deq_signoff',
      'identity_match',
      'other'
    )
  );

ALTER TABLE public.npdes_id_overrides
  DROP CONSTRAINT IF EXISTS npdes_id_overrides_confirmation_other_reference_check;

ALTER TABLE public.npdes_id_overrides
  ADD CONSTRAINT npdes_id_overrides_confirmation_other_reference_check
  CHECK (
    confirmation_basis IS DISTINCT FROM 'other'
    OR (confirmation_reference IS NOT NULL AND length(trim(confirmation_reference)) > 0)
  );

COMMENT ON COLUMN public.npdes_id_overrides.confirmation_basis IS
  'Human-verified source for DMLR→federal mapping (Slice 6 / task 3.38).';

COMMENT ON COLUMN public.npdes_id_overrides.confirmation_reference IS
  'CEDS ID, VPDES PDF cite, CD Attachment F reference, etc. Required when basis=other.';
