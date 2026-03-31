import type { FieldVisitListItem } from '@/types';

const STORAGE_KEY = 'scc.fieldRouteCache.v1';

export type FieldRouteCachePayload = {
  version: 1;
  routeDate: string;
  scope: 'mine' | 'org';
  /** User id when scope is mine; null for org-wide cache */
  viewerUserId: string | null;
  savedAt: string;
  visits: FieldVisitListItem[];
  outfallCoords: Record<string, { lat: number; lng: number }>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parsePayload(raw: string | null): FieldRouteCachePayload | null {
  if (raw == null || raw === '') return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!isRecord(data)) return null;
    if (data.version !== 1) return null;
    if (typeof data.routeDate !== 'string' || typeof data.scope !== 'string') return null;
    if (data.scope !== 'mine' && data.scope !== 'org') return null;
    if (!Array.isArray(data.visits)) return null;
    if (typeof data.savedAt !== 'string') return null;
    if (!isRecord(data.outfallCoords)) return null;
    return data as unknown as FieldRouteCachePayload;
  } catch {
    return null;
  }
}

export function loadFieldRouteCache(): FieldRouteCachePayload | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return parsePayload(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function loadFieldRouteCacheMatching(
  routeDate: string,
  scope: 'mine' | 'org',
  viewerUserId: string | null,
): FieldRouteCachePayload | null {
  const p = loadFieldRouteCache();
  if (!p) return null;
  if (p.routeDate !== routeDate || p.scope !== scope) return null;
  if (scope === 'mine' && p.viewerUserId !== viewerUserId) return null;
  return p;
}

/** Returns false if storage is blocked, quota exceeded, or serialization fails. */
export function saveFieldRouteCache(payload: {
  routeDate: string;
  scope: 'mine' | 'org';
  viewerUserId: string | null;
  visits: FieldVisitListItem[];
  outfallCoords: Record<string, { lat: number; lng: number }>;
}): boolean {
  if (typeof localStorage === 'undefined') return false;
  const full: FieldRouteCachePayload = {
    version: 1,
    savedAt: new Date().toISOString(),
    routeDate: payload.routeDate,
    scope: payload.scope,
    viewerUserId: payload.scope === 'mine' ? payload.viewerUserId : null,
    visits: payload.visits,
    outfallCoords: payload.outfallCoords,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
    return true;
  } catch {
    return false;
  }
}

export function clearFieldRouteCache(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
