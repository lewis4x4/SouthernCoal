/**
 * EPA NODI (No Data Indicator) codes for DMR reporting.
 * Reference: NetDMR User Guide, 40 CFR 122.41
 */

export interface NodiCode {
  code: string;
  description: string;
  category: "no_discharge" | "no_data" | "qualifier" | "conditional";
  excludeFromCalculations: boolean;
}

/**
 * Standard EPA NODI codes used in DMR submissions
 */
export const NODI_CODES: Record<string, NodiCode> = {
  // No Discharge codes
  "C": {
    code: "C",
    description: "No Discharge (entire monitoring period)",
    category: "no_discharge",
    excludeFromCalculations: true,
  },
  "9": {
    code: "9",
    description: "Conditional Monitoring - not required this period",
    category: "conditional",
    excludeFromCalculations: true,
  },

  // No Data codes
  "N": {
    code: "N",
    description: "No Data - monitoring not performed",
    category: "no_data",
    excludeFromCalculations: true,
  },
  "B": {
    code: "B",
    description: "Below Detection Limit",
    category: "qualifier",
    excludeFromCalculations: false,
  },
  "E": {
    code: "E",
    description: "Estimated Value",
    category: "qualifier",
    excludeFromCalculations: false,
  },

  // Qualifier codes
  "G": {
    code: "G",
    description: "Greater Than (value exceeds instrument range)",
    category: "qualifier",
    excludeFromCalculations: false,
  },
  "K": {
    code: "K",
    description: "Actual Value (no qualifier)",
    category: "qualifier",
    excludeFromCalculations: false,
  },
  "Q": {
    code: "Q",
    description: "Quantity (for mass-based limits)",
    category: "qualifier",
    excludeFromCalculations: false,
  },
  "R": {
    code: "R",
    description: "Rejected - QA/QC failed",
    category: "no_data",
    excludeFromCalculations: true,
  },
  "T": {
    code: "T",
    description: "Too numerous to count",
    category: "qualifier",
    excludeFromCalculations: false,
  },
  "U": {
    code: "U",
    description: "Unable to measure",
    category: "no_data",
    excludeFromCalculations: true,
  },
  "W": {
    code: "W",
    description: "Waived - variance granted",
    category: "conditional",
    excludeFromCalculations: true,
  },
};

/**
 * Check if a NODI code indicates no actual data should be recorded
 */
export function isNoDataCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const nodi = NODI_CODES[code.toUpperCase()];
  return nodi?.excludeFromCalculations ?? false;
}

/**
 * Check if a NODI code indicates no discharge occurred
 */
export function isNoDischargeCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const upper = code.toUpperCase();
  return upper === "C" || upper === "9";
}

/**
 * Check if a NODI code indicates below detection limit
 */
export function isBelowDetectionCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return code.toUpperCase() === "B";
}

/**
 * Get human-readable description for a NODI code
 */
export function getNodiDescription(code: string | null | undefined): string {
  if (!code) return "";
  const nodi = NODI_CODES[code.toUpperCase()];
  return nodi?.description ?? `Unknown NODI code: ${code}`;
}

/**
 * Validate a NODI code
 */
export function isValidNodiCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return code.toUpperCase() in NODI_CODES;
}
