/**
 * Task 2.64 — validate parameter alias / STORET coverage (automated harness).
 * Full sign-off still requires client lab files (DISCOVERY Q27).
 */

/** Canonical parameter names seeded in `parameters` + `parameter_aliases` migration. */
export const SEEDED_CANONICAL_PARAMETER_NAMES = [
  'Iron, Total',
  'Iron, Dissolved',
  'Manganese, Total',
  'Manganese, Dissolved',
  'pH',
  'Total Suspended Solids',
  'Selenium, Total',
  'Selenium, Dissolved',
  'Specific Conductance',
  'Sulfate',
  'Settleable Solids',
  'Aluminum, Total',
  'Aluminum, Dissolved',
  'Total Dissolved Solids',
  'Temperature',
  'Flow',
  'Mercury, Total',
  'Dissolved Oxygen',
  'Turbidity',
  'Oil & Grease',
  'Alkalinity',
  'Hardness',
  'Acidity',
  'BOD',
  'Ammonia',
  'Calcium',
  'Magnesium',
  'Sodium',
  'Potassium',
  'Osmotic Pressure',
  'Chloride',
] as const;

/**
 * Parser PARAMETER_MAP uses short labels; map to DB canonical names for drift checks.
 */
export const PARSER_SHORT_TO_CANONICAL: Record<string, string> = {
  Iron: 'Iron, Total',
  Manganese: 'Manganese, Total',
  pH: 'pH',
  'Total Suspended Solids': 'Total Suspended Solids',
  Selenium: 'Selenium, Total',
  Conductivity: 'Specific Conductance',
  'Total Dissolved Solids': 'Total Dissolved Solids',
  Sulfate: 'Sulfate',
  Chloride: 'Chloride',
  Alkalinity: 'Alkalinity',
  Hardness: 'Hardness',
  Aluminum: 'Aluminum, Total',
};

/** WV EDD / multi-state lab columns that must resolve without falling through to title-case. */
export const CRITICAL_LAB_PARAMETER_ALIASES = [
  'fe_tot',
  'iron, total',
  'mn_tot',
  'manganese, total',
  'ph',
  'ph_fld',
  'tss',
  'total suspended solids',
  '01045',
  '01055',
  '00400',
  '00530',
  '00095',
  '00945',
  '00940',
  '00410',
  '00900',
  'specific conductance',
  'sp cond',
] as const;

export interface ParameterMapValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  mappedKeyCount: number;
  unmappedCritical: string[];
  unknownCanonicalTargets: string[];
}

export function validateParserParameterMap(map: Record<string, string>): ParameterMapValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const canonicalSet = new Set<string>(SEEDED_CANONICAL_PARAMETER_NAMES);
  const unknownCanonicalTargets: string[] = [];

  for (const [key, value] of Object.entries(map)) {
    if (!key.trim()) errors.push('Empty parameter map key');
    if (!value.trim()) errors.push(`Empty canonical value for key "${key}"`);
    if (key !== key.toLowerCase() && !/^\d{5}$/.test(key)) {
      warnings.push(`Key "${key}" is not normalized lowercase (parser should lower-case before lookup)`);
    }

    const expectedCanonical = PARSER_SHORT_TO_CANONICAL[value] ?? value;
    if (!canonicalSet.has(expectedCanonical)) {
      unknownCanonicalTargets.push(`${key} → ${value}`);
    }
  }

  for (const drift of unknownCanonicalTargets) {
    warnings.push(`Parser target not in seeded canonical list: ${drift}`);
  }

  const unmappedCritical = CRITICAL_LAB_PARAMETER_ALIASES.filter(
    (alias) => !Object.prototype.hasOwnProperty.call(map, alias),
  );

  if (unmappedCritical.length > 0) {
    errors.push(`Missing critical lab aliases: ${unmappedCritical.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    mappedKeyCount: Object.keys(map).length,
    unmappedCritical,
    unknownCanonicalTargets,
  };
}
