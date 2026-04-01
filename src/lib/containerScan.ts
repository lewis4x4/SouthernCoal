import type {
  FieldVisitContainerValidation,
  FieldVisitScannedContainer,
  FieldVisitStopRequirement,
} from '@/types';

const BOTTLE_TYPE_PATTERNS: Array<{ bottleType: string; matches: RegExp[] }> = [
  {
    bottleType: '40ml_vial',
    matches: [/\b40\s*ml\b/i, /\b40ml\b/i, /\bvial\b/i, /\bvoc\b/i],
  },
  {
    bottleType: 'sterile_bottle',
    matches: [/\bsterile\b/i, /\be\.?\s*coli\b/i, /\bcoliform\b/i, /\bbacteria\b/i],
  },
  {
    bottleType: '1l_bottle',
    matches: [/\b1\s*l\b/i, /\b1l\b/i, /\b1000\s*ml\b/i, /\b1-liter\b/i],
  },
  {
    bottleType: '500ml_bottle',
    matches: [/\b500\s*ml\b/i, /\b500ml\b/i],
  },
  {
    bottleType: '250ml_bottle',
    matches: [/\b250\s*ml\b/i, /\b250ml\b/i],
  },
  {
    bottleType: 'metals_preserved',
    matches: [/\bmetals?\b/i, /\bnitric\b/i, /\bhno3\b/i],
  },
  {
    bottleType: 'amber_bottle',
    matches: [/\bamber\b/i],
  },
];

const PRESERVATIVE_PATTERNS: Array<{ label: string; matches: RegExp[] }> = [
  { label: 'nitric acid', matches: [/\bnitric\b/i, /\bhno3\b/i] },
  { label: 'sulfuric acid', matches: [/\bsulfuric\b/i, /\bh2so4\b/i] },
  { label: 'sodium hydroxide', matches: [/\bnaoh\b/i, /\bsodium hydroxide\b/i] },
  { label: 'cool to 4C', matches: [/\bon ice\b/i, /\b4c\b/i, /\bcool/i] },
];

const ID_VALUE_PATTERN = /\b(?:cid|id|container|bottle)[:=\s-]+([A-Z0-9-]+)/i;
const SERIAL_VALUE_PATTERN = /\b(?:serial|ser|sn)[:=\s-]+([A-Z0-9-]+)/i;

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function inferBottleType(text: string): string | null {
  const normalized = normalizeWhitespace(text);
  const match = BOTTLE_TYPE_PATTERNS.find((candidate) =>
    candidate.matches.some((pattern) => pattern.test(normalized)),
  );
  return match?.bottleType ?? null;
}

function inferPreservativeHint(text: string): string | null {
  const normalized = normalizeWhitespace(text);
  const match = PRESERVATIVE_PATTERNS.find((candidate) =>
    candidate.matches.some((pattern) => pattern.test(normalized)),
  );
  return match?.label ?? null;
}

export function inferExpectedBottleTypesForStop(stopRequirements: FieldVisitStopRequirement[]) {
  return [...new Set(
    stopRequirements
      .flatMap((requirement) => {
        const text = [
          requirement.parameter_name,
          requirement.parameter_label,
          requirement.sample_type,
          requirement.schedule_instructions,
        ]
          .filter(Boolean)
          .join(' ');
        const bottleType = inferBottleType(text);
        return bottleType ? [bottleType] : [];
      }),
  )];
}

export function formatBottleTypeLabel(bottleType: string) {
  switch (bottleType) {
    case '40ml_vial':
      return '40 mL vial';
    case 'sterile_bottle':
      return 'sterile bottle';
    case '1l_bottle':
      return '1 L bottle';
    case '500ml_bottle':
      return '500 mL bottle';
    case '250ml_bottle':
      return '250 mL bottle';
    case 'metals_preserved':
      return 'metals-preserved bottle';
    case 'amber_bottle':
      return 'amber bottle';
    default:
      return bottleType.replace(/_/g, ' ');
  }
}

export function barcodeScannerSupported() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function parseContainerScan(rawValue: string): FieldVisitScannedContainer {
  const normalized = normalizeWhitespace(rawValue);
  const containerId = normalized.match(ID_VALUE_PATTERN)?.[1]
    ?? normalized.split(/[|,;]/)[0]?.trim()
    ?? normalized;
  const serialId = normalized.match(SERIAL_VALUE_PATTERN)?.[1] ?? null;

  return {
    raw_value: normalized,
    container_id: containerId,
    serial_id: serialId,
    bottle_type: inferBottleType(normalized),
    preservative_hint: inferPreservativeHint(normalized),
  };
}

export function validateContainerAgainstStop(
  scan: FieldVisitScannedContainer | null,
  stopRequirements: FieldVisitStopRequirement[],
): FieldVisitContainerValidation {
  const expectedBottleTypes = inferExpectedBottleTypesForStop(stopRequirements);

  if (expectedBottleTypes.length === 0) {
    return {
      status: 'unknown',
      blocking: false,
      message: null,
      guidance: ['No bottle or kit rule could be derived from this stop yet. Container ID capture can proceed.'],
      expected_bottle_types: [],
      actual_bottle_type: scan?.bottle_type ?? null,
    };
  }

  if (!scan?.bottle_type) {
    return {
      status: 'unknown',
      blocking: false,
      message: 'Container ID captured, but bottle or kit type could not be verified from this entry.',
      guidance: [
        `Expected for this stop: ${expectedBottleTypes.map(formatBottleTypeLabel).join(', ')}.`,
        'Use the scanner when possible, or manually confirm the bottle and preservative before completing.',
      ],
      expected_bottle_types: expectedBottleTypes,
      actual_bottle_type: null,
    };
  }

  if (expectedBottleTypes.includes(scan.bottle_type)) {
    return {
      status: 'match',
      blocking: false,
      message: `Bottle or kit looks aligned with this stop: ${formatBottleTypeLabel(scan.bottle_type)}.`,
      guidance: [],
      expected_bottle_types: expectedBottleTypes,
      actual_bottle_type: scan.bottle_type,
    };
  }

  return {
    status: 'warning',
    blocking: true,
    message: `Scanned bottle or kit looks wrong for this stop. Expected ${expectedBottleTypes.map(formatBottleTypeLabel).join(' or ')}, but captured ${formatBottleTypeLabel(scan.bottle_type)}.`,
    guidance: [
      'Rescan the correct bottle or switch to the correct kit before completing.',
      'Manual entry remains available, but it will not clear a known mismatch from a scanned bottle.',
    ],
    expected_bottle_types: expectedBottleTypes,
    actual_bottle_type: scan.bottle_type,
  };
}
