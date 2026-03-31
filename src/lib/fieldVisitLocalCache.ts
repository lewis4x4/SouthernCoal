import type { FieldVisitDetails } from '@/types';

function storageKey(visitId: string) {
  return `scc.fieldVisitCache.v1.${visitId}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parsePayload(raw: string | null): FieldVisitDetails | null {
  if (raw == null || raw === '') return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!isRecord(data)) return null;
    if (!isRecord(data.visit) || typeof data.visit.id !== 'string') return null;
    if (!Array.isArray(data.measurements)) return null;
    if (!Array.isArray(data.evidence)) return null;
    if (!Array.isArray(data.governanceIssues)) return null;
    return data as unknown as FieldVisitDetails;
  } catch {
    return null;
  }
}

export function loadFieldVisitCache(visitId: string): FieldVisitDetails | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return parsePayload(localStorage.getItem(storageKey(visitId)));
  } catch {
    return null;
  }
}

export function saveFieldVisitCache(detail: FieldVisitDetails): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(storageKey(detail.visit.id), JSON.stringify(detail));
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
