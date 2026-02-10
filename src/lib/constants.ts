// =============================================================================
// Canonical Category Mapping — Single Source of Truth (v6 Section 6)
// =============================================================================
// Every component uses these helpers instead of hardcoded category strings.
// Three naming conventions mapped: DB key, storage bucket, display label.
// =============================================================================

export interface CategoryConfig {
  /** Database enum value in file_processing_queue.file_category */
  dbKey: string;
  /** Storage bucket name */
  bucket: string;
  /** Human-readable display label */
  label: string;
  /** Compliance Matrix column header */
  matrixLabel: string;
  /** Accepted MIME types */
  acceptedTypes: string[];
  /** Upload priority (1 = highest) */
  priority: number;
  /** Storage path strategy */
  buildPath: (opts: { stateCode?: string; fileName: string; hashPrefix: string }) => string;
}

/** State code → full name mapping for storage paths */
export const STATE_MAP: Record<string, string> = {
  AL: 'Alabama',
  KY: 'Kentucky',
  TN: 'Tennessee',
  VA: 'Virginia',
  WV: 'West_Virginia',
};

function stateScoped(opts: { stateCode?: string; fileName: string; hashPrefix: string }): string {
  const folder = opts.stateCode ? STATE_MAP[opts.stateCode] ?? opts.stateCode : 'Unassigned';
  return `${folder}/${opts.hashPrefix}_${opts.fileName}`;
}

function flat(opts: { fileName: string; hashPrefix: string }): string {
  return `${opts.hashPrefix}_${opts.fileName}`;
}

export const CATEGORIES: CategoryConfig[] = [
  {
    dbKey: 'npdes_permit',
    bucket: 'permits',
    label: 'NPDES Permits',
    matrixLabel: 'Permits',
    acceptedTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff'],
    priority: 1,
    buildPath: stateScoped,
  },
  {
    dbKey: 'lab_data',
    bucket: 'lab-data',
    label: 'Lab Data',
    matrixLabel: 'Lab Data',
    acceptedTypes: [
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/tab-separated-values',
    ],
    priority: 2,
    buildPath: stateScoped,
  },
  {
    dbKey: 'field_inspection',
    bucket: 'field-inspections',
    label: 'Field Inspections',
    matrixLabel: 'Field Insp.',
    acceptedTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'],
    priority: 3,
    buildPath: stateScoped,
  },
  {
    dbKey: 'quarterly_report',
    bucket: 'quarterly-reports',
    label: 'Quarterly Reports',
    matrixLabel: 'Quarterly',
    acceptedTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    priority: 4,
    buildPath: (opts) => {
      // Quarter-scoped: detect quarter from filename or default to state folder
      const qMatch = opts.fileName.match(/[Qq]([1-4])[_\s-]?(\d{4})/);
      if (qMatch) {
        return `Q${qMatch[1]}_${qMatch[2]}/${opts.hashPrefix}_${opts.fileName}`;
      }
      return stateScoped(opts);
    },
  },
  {
    dbKey: 'dmr',
    bucket: 'dmrs',
    label: 'DMRs',
    matrixLabel: 'DMRs',
    acceptedTypes: [
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    priority: 4,
    buildPath: stateScoped,
  },
  {
    dbKey: 'audit_report',
    bucket: 'audit-reports',
    label: 'Audit Reports',
    matrixLabel: 'Audits',
    acceptedTypes: ['application/pdf'],
    priority: 5,
    buildPath: flat,
  },
  {
    dbKey: 'enforcement',
    bucket: 'enforcement',
    label: 'Enforcement',
    matrixLabel: 'Enforcement',
    acceptedTypes: ['application/pdf'],
    priority: 6,
    buildPath: stateScoped,
  },
  {
    dbKey: 'other',
    bucket: 'other',
    label: 'Other',
    matrixLabel: 'Other',
    // Deliberate v6 policy choice: v5 allows "Any" but we restrict for security.
    acceptedTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/tiff',
    ],
    priority: 7,
    buildPath: flat,
  },
];

// Lookup helpers
export const CATEGORY_BY_DB_KEY = Object.fromEntries(
  CATEGORIES.map((c) => [c.dbKey, c]),
) as Record<string, CategoryConfig>;

export const CATEGORY_BY_BUCKET = Object.fromEntries(
  CATEGORIES.map((c) => [c.bucket, c]),
) as Record<string, CategoryConfig>;

// =============================================================================
// States
// =============================================================================

export interface StateConfig {
  code: string;
  name: string;
  agency: string;
  dmrSystem: string;
}

export const STATES: StateConfig[] = [
  { code: 'AL', name: 'Alabama', agency: 'ADEM', dmrSystem: 'E2DMR' },
  { code: 'KY', name: 'Kentucky', agency: 'KYDEP', dmrSystem: 'NetDMR' },
  { code: 'TN', name: 'Tennessee', agency: 'TDEC', dmrSystem: 'MyTDEC' },
  { code: 'VA', name: 'Virginia', agency: 'DMLR', dmrSystem: 'eDMR' },
  { code: 'WV', name: 'West Virginia', agency: 'DEP', dmrSystem: 'NetDMR' },
];

export const STATE_BY_CODE = Object.fromEntries(
  STATES.map((s) => [s.code, s]),
) as Record<string, StateConfig>;

// =============================================================================
// File Processing Status
// =============================================================================

export const FILE_STATUSES = [
  'uploaded',
  'queued',
  'processing',
  'parsed',
  'imported',
  'failed',
] as const;

export type FileStatus = (typeof FILE_STATUSES)[number];

// =============================================================================
// Auto-Classification Regex Patterns
// =============================================================================

export interface ClassificationPattern {
  regex: RegExp;
  field: 'state' | 'category';
  value?: string;
}

export const FILENAME_PATTERNS: ClassificationPattern[] = [
  // State detection — abbreviations
  { regex: /\b(AL)\b/i, field: 'state', value: 'AL' },
  { regex: /\b(KY)\b/i, field: 'state', value: 'KY' },
  { regex: /\b(TN)\b/i, field: 'state', value: 'TN' },
  { regex: /\b(VA)\b/i, field: 'state', value: 'VA' },
  { regex: /\b(WV)\b/i, field: 'state', value: 'WV' },
  // State detection — full names
  { regex: /\balabama\b/i, field: 'state', value: 'AL' },
  { regex: /\bkentucky\b/i, field: 'state', value: 'KY' },
  { regex: /\btennessee\b/i, field: 'state', value: 'TN' },
  { regex: /\bvirginia\b/i, field: 'state', value: 'VA' },
  { regex: /\bwest.?virginia\b/i, field: 'state', value: 'WV' },
  // State detection — permit number prefixes
  { regex: /AL\d{7}/, field: 'state', value: 'AL' },
  { regex: /KYGE\d{5}/, field: 'state', value: 'KY' },
  { regex: /TN[R0]\d{6}/, field: 'state', value: 'TN' },
  { regex: /VA\d{7}/, field: 'state', value: 'VA' },
  { regex: /WV\d{7}/, field: 'state', value: 'WV' },
  // Category detection — permit-related documents (all sub-types)
  { regex: /\bnpdes|permit\b/i, field: 'category', value: 'npdes_permit' },
  { regex: /\bmonitoring.?release|outfall.?release\b/i, field: 'category', value: 'npdes_permit' },
  { regex: /\bwet.?suspension|toxicity.?suspension\b/i, field: 'category', value: 'npdes_permit' },
  { regex: /\bselenium.?compliance\b/i, field: 'category', value: 'npdes_permit' },
  { regex: /\bmodification|mod\s*#\d/i, field: 'category', value: 'npdes_permit' },
  { regex: /\binactivation\b/i, field: 'category', value: 'npdes_permit' },
  { regex: /\btransfer\b/i, field: 'category', value: 'npdes_permit' },
  { regex: /\btsmp\b|TNR\d{6}/i, field: 'category', value: 'npdes_permit' },
  { regex: /\bEKCL\b|KYGE\d{5}/i, field: 'category', value: 'npdes_permit' },
  { regex: /\bNPE\(|NPR\s*#/i, field: 'category', value: 'npdes_permit' },
  { regex: /\blab|analytical|results|edd\b/i, field: 'category', value: 'lab_data' },
  { regex: /\bdmr|discharge.?monitoring\b/i, field: 'category', value: 'dmr' },
  { regex: /\bquarterly|q[1-4]\b/i, field: 'category', value: 'quarterly_report' },
  { regex: /\bfield.?inspect|inspection.?report|site.?visit|swppp\b/i, field: 'category', value: 'field_inspection' },
  { regex: /\baudit|ems\b/i, field: 'category', value: 'audit_report' },
  { regex: /\benforcement|nov|penalty|violation\b/i, field: 'category', value: 'enforcement' },
];
