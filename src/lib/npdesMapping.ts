/** Federal NPDES ID validation and VA DMLR crosswalk helpers (task 3.38). */

const SCC_STATES = new Set(['AL', 'KY', 'TN', 'VA', 'WV']);

/** EPA-style NPDES ID: 2-letter state + 7 digits (e.g. VA0081742). */
const FEDERAL_NPDES_PATTERN = /^[A-Z]{2}\d{7}$/;

/** Bare 7-digit DMLR / mining permit numbers (e.g. 1100877). */
const BARE_DMLR_PATTERN = /^\d{7}$/;

/** AI-fabricated pseudo-NPDES: VA prefix + raw DMLR series (1xxx/2xxx), e.g. VA1101916. */
const PSEUDO_VA_DMLR_EMBED_PATTERN = /^VA[12]\d{6}$/;

export type RegistryPermitIdKind = 'federal_npdes' | 'dmlr_mining' | 'pseudo_va_npdes' | 'other';

export interface FederalNpdesValidation {
  valid: boolean;
  message?: string;
}

export function normalizePermitId(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidFederalNpdesId(value: string): boolean {
  return FEDERAL_NPDES_PATTERN.test(normalizePermitId(value));
}

export function validateFederalNpdesId(value: string): FederalNpdesValidation {
  const id = normalizePermitId(value);
  if (!id) {
    return { valid: false, message: 'Federal NPDES ID is required.' };
  }
  if (!FEDERAL_NPDES_PATTERN.test(id)) {
    return {
      valid: false,
      message: 'Use EPA format: 2-letter state code + 7 digits (e.g. VA0081742).',
    };
  }
  const state = id.slice(0, 2);
  if (!SCC_STATES.has(state)) {
    return {
      valid: false,
      message: `State prefix "${state}" is outside SCC coverage (AL/KY/TN/VA/WV).`,
    };
  }
  return { valid: true };
}

export function isLikelyDmlrMiningId(permitNumber: string): boolean {
  return BARE_DMLR_PATTERN.test(normalizePermitId(permitNumber));
}

export function isLikelyPseudoVaNpdes(permitNumber: string): boolean {
  return PSEUDO_VA_DMLR_EMBED_PATTERN.test(normalizePermitId(permitNumber));
}

export function classifyRegistryPermitId(
  permitNumber: string,
  stateCode?: string | null,
): RegistryPermitIdKind {
  const id = normalizePermitId(permitNumber);
  if (isLikelyPseudoVaNpdes(id)) return 'pseudo_va_npdes';
  if (isLikelyDmlrMiningId(id)) return 'dmlr_mining';
  if (isValidFederalNpdesId(id)) return 'federal_npdes';
  if ((stateCode === 'VA' || id.startsWith('VA')) && /^VA/i.test(id)) return 'other';
  return 'other';
}

export function registryGapHint(
  permitNumber: string,
  stateCode?: string | null,
): string | null {
  const kind = classifyRegistryPermitId(permitNumber, stateCode);
  switch (kind) {
    case 'dmlr_mining':
      return 'DMLR mining permit ID — enter the real federal VPDES ID from DEQ/CEDS, not a VA00-prefixed guess.';
    case 'pseudo_va_npdes':
      return 'Likely DMLR-derived pseudo-NPDES — replace with the verified federal VPDES ID before ECHO sync.';
    default:
      return stateCode === 'VA'
        ? 'VA registry row missing federal mapping — confirm VPDES ID with DEQ records.'
        : null;
  }
}

/** Litigation-grade confirmation basis for VA DMLR → federal NPDES overrides (Slice 6). */
export const NPDES_CONFIRMATION_BASIS = [
  { value: 'vpdes_pdf', label: 'VPDES permit PDF' },
  { value: 'va_deq_ceds', label: 'VA DEQ CEDS record' },
  { value: 'cd_attachment_f', label: 'Consent Decree Attachment F' },
  { value: 'operator_deq_signoff', label: 'Operator / DEQ sign-off' },
  { value: 'identity_match', label: 'Twin permit identity match' },
  { value: 'other', label: 'Other (reference required)' },
] as const;

export type NpdesConfirmationBasis = (typeof NPDES_CONFIRMATION_BASIS)[number]['value'];

const CONFIRMATION_BASIS_SET = new Set<string>(
  NPDES_CONFIRMATION_BASIS.map((b) => b.value),
);

export interface ConfirmationBasisValidation {
  valid: boolean;
  message?: string;
}

const PLACEHOLDER_CONFIRMATION_REFERENCE_PATTERN = /\b(todo|tbd|placeholder)\b/i;

export function hasPlaceholderConfirmationReference(reference: string | null | undefined): boolean {
  return PLACEHOLDER_CONFIRMATION_REFERENCE_PATTERN.test(reference?.trim() ?? '');
}

export function validateConfirmationBasis(
  basis: string | null | undefined,
  reference?: string | null,
  {
    required = false,
    requireReference = false,
  }: { required?: boolean; requireReference?: boolean } = {},
): ConfirmationBasisValidation {
  if (!basis || !basis.trim()) {
    if (required) {
      return { valid: false, message: 'Confirmation basis is required for VA mappings.' };
    }
    return { valid: true };
  }
  const normalized = basis.trim();
  if (!CONFIRMATION_BASIS_SET.has(normalized)) {
    return { valid: false, message: 'Invalid confirmation basis.' };
  }
  const ref = reference?.trim();
  if ((requireReference || normalized === 'other') && !ref) {
    return { valid: false, message: 'Confirmation reference is required.' };
  }
  if (hasPlaceholderConfirmationReference(ref)) {
    return { valid: false, message: 'Replace TODO/TBD confirmation reference before saving.' };
  }
  return { valid: true };
}

export function confirmationBasisLabel(basis: string | null | undefined): string | null {
  if (!basis) return null;
  return NPDES_CONFIRMATION_BASIS.find((b) => b.value === basis)?.label ?? basis;
}

export function suggestedConfirmationBases(
  kind: RegistryPermitIdKind,
): NpdesConfirmationBasis[] {
  switch (kind) {
    case 'dmlr_mining':
      return ['cd_attachment_f', 'va_deq_ceds', 'vpdes_pdf'];
    case 'pseudo_va_npdes':
      return ['vpdes_pdf', 'va_deq_ceds', 'operator_deq_signoff'];
    default:
      return ['operator_deq_signoff', 'va_deq_ceds', 'vpdes_pdf'];
  }
}
