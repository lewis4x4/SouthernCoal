import type { FieldVisitListItem } from '@/types';

const STORAGE_KEY = 'scc.fieldRouteCache.v1';

export type FieldRouteCachePayload = {
  version: 3;
  routeDate: string;
  organizationId: string;
  scope: 'mine' | 'org';
  /** Authenticated user who created this snapshot, even for org scope. */
  viewerUserId: string;
  savedAt: string;
  visits: FieldVisitListItem[];
  outfallCoords: Record<string, { lat: number; lng: number }>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateFieldRouteCacheRecord(data: unknown): FieldRouteCachePayload | null {
  if (!isRecord(data)) return null;
  if (data.version !== 3) return null;
  if (typeof data.routeDate !== 'string' || typeof data.scope !== 'string') return null;
  if (typeof data.organizationId !== 'string' || data.organizationId.trim() === '') return null;
  if (data.scope !== 'mine' && data.scope !== 'org') return null;
  if (typeof data.viewerUserId !== 'string' || data.viewerUserId.trim() === '') return null;
  if (!Array.isArray(data.visits)) return null;
  if (typeof data.savedAt !== 'string') return null;
  if (!isRecord(data.outfallCoords)) return null;
  return data as unknown as FieldRouteCachePayload;
}

function parsePayload(raw: string | null): FieldRouteCachePayload | null {
  if (raw == null || raw === '') return null;
  try {
    const data = JSON.parse(raw) as unknown;
    return validateFieldRouteCacheRecord(data);
  } catch {
    return null;
  }
}

function toFullPayload(payload: {
  routeDate: string;
  organizationId: string;
  scope: 'mine' | 'org';
  viewerUserId: string | null;
  visits: FieldVisitListItem[];
  outfallCoords: Record<string, { lat: number; lng: number }>;
}): FieldRouteCachePayload {
  if (!payload.viewerUserId) {
    throw new Error('viewerUserId is required for route snapshots');
  }
  return {
    version: 3,
    savedAt: new Date().toISOString(),
    routeDate: payload.routeDate,
    organizationId: payload.organizationId,
    scope: payload.scope,
    viewerUserId: payload.viewerUserId,
    visits: payload.visits,
    outfallCoords: payload.outfallCoords,
  };
}

const ROUTE_CACHE_IDB = 'scc-field-route-cache';
const ROUTE_CACHE_STORE = 'snapshots';
const ROUTE_CACHE_IDB_VERSION = 1;
const ROUTE_CACHE_KEY = 'current';

function warnIdb(label: string, err: unknown) {
  if (import.meta.env.DEV) {
    console.warn(`[fieldRouteCache] ${label}`, err);
  }
}

function openRouteCacheIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(ROUTE_CACHE_IDB, ROUTE_CACHE_IDB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ROUTE_CACHE_STORE)) {
        db.createObjectStore(ROUTE_CACHE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

/** Load route snapshot from IndexedDB (larger quota than localStorage). */
export async function loadFieldRouteCacheFromIdb(): Promise<FieldRouteCachePayload | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openRouteCacheIdb();
    try {
      const tx = db.transaction(ROUTE_CACHE_STORE, 'readonly');
      const store = tx.objectStore(ROUTE_CACHE_STORE);
      const raw: unknown = await new Promise((resolve, reject) => {
        const r = store.get(ROUTE_CACHE_KEY);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error ?? new Error('IDB get failed'));
      });
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error ?? new Error('IDB tx failed'));
      });
      const payload = validateFieldRouteCacheRecord(raw);
      if (raw != null && !payload) {
        void clearFieldRouteCacheFromIdb().catch((err) => warnIdb('clear after corrupt IDB snapshot', err));
      }
      return payload;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function loadFieldRouteCacheFromIdbMatching(
  routeDate: string,
  scope: 'mine' | 'org',
  viewerUserId: string | null,
  organizationId: string | null,
): Promise<FieldRouteCachePayload | null> {
  const payload = await loadFieldRouteCacheFromIdb();
  if (!payload) return null;
  if (!hasRouteCacheAuthContext(viewerUserId, organizationId)) {
    return null;
  }
  if (!fieldRouteCacheMatchesView(payload, routeDate, scope, viewerUserId, organizationId)) {
    await clearFieldRouteCacheFromIdb();
    return null;
  }
  return payload;
}

export async function saveFieldRouteCacheToIdb(full: FieldRouteCachePayload): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    const db = await openRouteCacheIdb();
    try {
      const tx = db.transaction(ROUTE_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(ROUTE_CACHE_STORE);
      await new Promise<void>((resolve, reject) => {
        const r = store.put(full, ROUTE_CACHE_KEY);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error ?? new Error('IDB put failed'));
      });
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error ?? new Error('IDB tx failed'));
      });
      return true;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

export async function clearFieldRouteCacheFromIdb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openRouteCacheIdb();
    try {
      const tx = db.transaction(ROUTE_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(ROUTE_CACHE_STORE);
      await new Promise<void>((resolve, reject) => {
        const r = store.delete(ROUTE_CACHE_KEY);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error ?? new Error('IDB delete failed'));
      });
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error ?? new Error('IDB tx failed'));
      });
    } finally {
      db.close();
    }
  } catch {
    /* ignore */
  }
}

function hasRouteCacheAuthContext(viewerUserId: string | null, organizationId: string | null): boolean {
  return Boolean(viewerUserId && organizationId);
}

/** True when snapshot matches the route date, scope, organization, and viewer. */
export function fieldRouteCacheMatchesView(
  p: FieldRouteCachePayload,
  routeDate: string,
  scope: 'mine' | 'org',
  viewerUserId: string | null,
  organizationId: string | null,
): boolean {
  if (!hasRouteCacheAuthContext(viewerUserId, organizationId)) return false;
  if (p.routeDate !== routeDate || p.scope !== scope) return false;
  if (p.organizationId !== organizationId) return false;
  if (p.viewerUserId !== viewerUserId) return false;
  return true;
}

/**
 * Save to localStorage and IndexedDB; returns success if either layer persisted.
 * Await when the UI must reflect the IDB copy immediately (e.g. offline hydration).
 */
export async function saveFieldRouteCacheDual(payload: {
  routeDate: string;
  organizationId: string;
  scope: 'mine' | 'org';
  viewerUserId: string | null;
  visits: FieldVisitListItem[];
  outfallCoords: Record<string, { lat: number; lng: number }>;
}): Promise<{ ok: boolean; snapshot: FieldRouteCachePayload }> {
  const full = toFullPayload(payload);
  let lsOk = false;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
      lsOk = true;
    } catch {
      /* quota / blocked */
    }
  }
  const idbOk = await saveFieldRouteCacheToIdb(full);
  return { ok: lsOk || idbOk, snapshot: full };
}

export function loadFieldRouteCache(): FieldRouteCachePayload | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const payload = parsePayload(raw);
    if (raw != null && !payload) {
      localStorage.removeItem(STORAGE_KEY);
    }
    return payload;
  } catch {
    return null;
  }
}

export function loadFieldRouteCacheMatching(
  routeDate: string,
  scope: 'mine' | 'org',
  viewerUserId: string | null,
  organizationId: string | null,
): FieldRouteCachePayload | null {
  const p = loadFieldRouteCache();
  if (!p) return null;
  if (!hasRouteCacheAuthContext(viewerUserId, organizationId)) {
    return null;
  }
  if (!fieldRouteCacheMatchesView(p, routeDate, scope, viewerUserId, organizationId)) {
    clearFieldRouteCache();
    return null;
  }
  return p;
}

/** Returns false if localStorage save fails. IndexedDB mirror is attempted in the background. */
export function saveFieldRouteCache(payload: {
  routeDate: string;
  organizationId: string;
  scope: 'mine' | 'org';
  viewerUserId: string | null;
  visits: FieldVisitListItem[];
  outfallCoords: Record<string, { lat: number; lng: number }>;
}): boolean {
  const full = toFullPayload(payload);
  let lsOk = false;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
      lsOk = true;
    } catch {
      /* quota */
    }
  }
  void saveFieldRouteCacheToIdb(full).catch((err) => warnIdb('IDB mirror save failed', err));
  return lsOk;
}

export function clearFieldRouteCache(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  void clearFieldRouteCacheFromIdb().catch((err) => warnIdb('IDB clear failed', err));
}

/** Find a visit row in the last saved offline route snapshot (single-slot cache). */
export function findVisitInFieldRouteCache(visitId: string): FieldVisitListItem | null {
  if (!visitId) return null;
  const p = loadFieldRouteCache();
  if (!p?.visits?.length) return null;
  const row = p.visits.find((v) => v?.id === visitId);
  return row ?? null;
}

function matchesOfflineVisitContext(
  payload: FieldRouteCachePayload,
  row: FieldVisitListItem,
  context?: { viewerUserId?: string | null; organizationId?: string | null },
): boolean {
  const org = context?.organizationId?.trim() ?? '';
  const viewer = context?.viewerUserId?.trim() ?? '';
  if (!org || !viewer) return false;
  if (payload.organizationId !== org) return false;
  if (row.organization_id !== org) return false;
  /** Org-wide snapshots are still tied to the user who saved them; same-org different-user reuse must not hydrate. */
  if (payload.viewerUserId !== viewer) return false;
  return true;
}

/** Prefer IndexedDB snapshot, then localStorage — for visit bootstrap when LS missed or quota failed. */
export async function findVisitInFieldRouteCacheAsync(
  visitId: string,
  context?: { viewerUserId?: string | null; organizationId?: string | null },
): Promise<FieldVisitListItem | null> {
  if (!visitId) return null;
  const idbPayload = await loadFieldRouteCacheFromIdb();
  if (idbPayload?.visits?.length) {
    const row = idbPayload.visits.find((v) => v?.id === visitId);
    if (row && matchesOfflineVisitContext(idbPayload, row, context)) return row;
  }
  const localPayload = loadFieldRouteCache();
  if (!localPayload?.visits?.length) return null;
  const row = localPayload.visits.find((visit) => visit?.id === visitId);
  if (!row || !matchesOfflineVisitContext(localPayload, row, context)) return null;
  return row;
}
