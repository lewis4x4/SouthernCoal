import type { FieldVisitDetails } from '@/types';

const FIELD_VISIT_CACHE_VERSION = 2;

export interface FieldVisitCacheScope {
  organizationId: string | null;
  viewerUserId: string | null;
}

interface FieldVisitCacheEnvelope {
  version: number;
  visitId: string;
  organizationId: string;
  viewerUserId: string;
  detail: FieldVisitDetails;
}

function storageKey(visitId: string) {
  return `scc.fieldVisitCache.v1.${visitId}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseDetail(data: unknown): FieldVisitDetails | null {
  if (!isRecord(data)) return null;
  if (!isRecord(data.visit) || typeof data.visit.id !== 'string') return null;
  if (!Array.isArray(data.measurements)) return null;
  if (!Array.isArray(data.evidence)) return null;
  if (!Array.isArray(data.governanceIssues)) return null;
  return {
    ...(data as unknown as FieldVisitDetails),
    stop_requirements: Array.isArray(data.stop_requirements) ? data.stop_requirements : [],
    required_field_measurements: Array.isArray(data.required_field_measurements)
      ? data.required_field_measurements
      : [],
    previous_visit_context: isRecord(data.previous_visit_context) || data.previous_visit_context === null
      ? (data.previous_visit_context as FieldVisitDetails['previous_visit_context'])
      : null,
  };
}

function parseEnvelope(raw: string | null): FieldVisitCacheEnvelope | null {
  if (raw == null || raw === '') return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!isRecord(data)) return null;
    if (data.version !== FIELD_VISIT_CACHE_VERSION) return null;
    if (typeof data.visitId !== 'string') return null;
    if (typeof data.organizationId !== 'string' || data.organizationId.trim() === '') return null;
    if (typeof data.viewerUserId !== 'string' || data.viewerUserId.trim() === '') return null;
    const detail = parseDetail(data.detail);
    if (!detail) return null;
    return {
      version: FIELD_VISIT_CACHE_VERSION,
      visitId: data.visitId,
      organizationId: data.organizationId,
      viewerUserId: data.viewerUserId,
      detail,
    };
  } catch {
    return null;
  }
}

export function loadFieldVisitCache(visitId: string, scope: FieldVisitCacheScope): FieldVisitDetails | null {
  if (typeof localStorage === 'undefined') return null;
  if (!scope.organizationId || !scope.viewerUserId) return null;
  try {
    const envelope = parseEnvelope(localStorage.getItem(storageKey(visitId)));
    if (
      !envelope
      || envelope.visitId !== visitId
      || envelope.organizationId !== scope.organizationId
      || envelope.viewerUserId !== scope.viewerUserId
      || envelope.detail.visit.id !== visitId
      || envelope.detail.visit.organization_id !== scope.organizationId
    ) {
      clearFieldVisitCache(visitId);
      return null;
    }
    return envelope.detail;
  } catch {
    return null;
  }
}

export function saveFieldVisitCache(detail: FieldVisitDetails, scope: FieldVisitCacheScope): boolean {
  if (typeof localStorage === 'undefined') return false;
  if (!scope.organizationId || !scope.viewerUserId) return false;
  if (detail.visit.organization_id !== scope.organizationId) return false;
  try {
    const envelope: FieldVisitCacheEnvelope = {
      version: FIELD_VISIT_CACHE_VERSION,
      visitId: detail.visit.id,
      organizationId: scope.organizationId,
      viewerUserId: scope.viewerUserId,
      detail,
    };
    localStorage.setItem(storageKey(detail.visit.id), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function clearFieldVisitCache(visitId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(visitId));
  } catch {
    /* ignore */
  }
}

export function clearAllFieldVisitCaches(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('scc.fieldVisitCache.v1.')) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
