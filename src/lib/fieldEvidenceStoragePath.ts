function sanitizeStorageSegment(value: string, fallback = 'file') {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[/\\\0]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '');

  return normalized || fallback;
}

function normalizePrefix(prefix: string) {
  const parts = prefix
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => sanitizeStorageSegment(segment, 'segment'));

  return parts.length > 0 ? `${parts.join('/')}/` : '';
}

export function buildFieldEvidenceStoragePath(input: {
  pathPrefix: string;
  referenceId: string;
  fileName: string;
  timestamp?: number;
}) {
  const trimmedName = input.fileName.trim();
  const lastDot = trimmedName.lastIndexOf('.');
  const hasExt = lastDot > 0 && lastDot < trimmedName.length - 1;
  const baseName = hasExt ? trimmedName.slice(0, lastDot) : trimmedName;
  const extension = hasExt
    ? sanitizeStorageSegment(trimmedName.slice(lastDot + 1).toLowerCase(), 'bin')
    : '';

  const safePrefix = normalizePrefix(input.pathPrefix);
  const safeReferenceId = sanitizeStorageSegment(input.referenceId, 'reference');
  const safeBaseName = sanitizeStorageSegment(baseName, 'upload');
  const ts = input.timestamp ?? Date.now();

  return `${safePrefix}${safeReferenceId}/${ts}_${safeBaseName}${extension ? `.${extension}` : ''}`;
}

