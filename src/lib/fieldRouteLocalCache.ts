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

function validateFieldRouteCacheRecord(data: unknown): FieldRouteCachePayload | null {
  if (!isRecord(data)) return null;
  if (data.version !== 1) return null;
  if (typeof data.routeDate !== 'string' || typeof data.scope !== 'string') return null;
  if (data.scope !== 'mine' && data.scope !== 'org') return null;
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
  scope: 'mine' | 'org';
  viewerUserId: string | null;
  visits: FieldVisitListItem[];
  outfallCoords: Record<string, { lat: number; lng: number }>;
}): FieldRouteCachePayload {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    routeDate: payload.routeDate,
    scope: payload.scope,
    viewerUserId: payload.scope === 'mine' ? payload.viewerUserId : null,
    visits: payload.visits,
    outfallCoords: payload.outfallCoords,
  };
}

const ROUTE_CACHE_IDB = 'scc-field-route-cache';
const ROUTE_CACHE_STORE = 'snapshots';
const ROUTE_CACHE_IDB_VERSION = 1;
const ROUTE_CACHE_KEY = 'current';

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
      return validateFieldRouteCacheRecord(raw);
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
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

/** True when snapshot matches the route date, scope, and (for mine) viewer. */
export function fieldRouteCacheMatchesView(
  p: FieldRouteCachePayload,
  routeDate: string,
  scope: 'mine' | 'org',
  viewerUserId: string | null,
): boolean {
  if (p.routeDate !== routeDate || p.scope !== scope) return false;
  if (scope === 'mine' && p.viewerUserId !== viewerUserId) return false;
  return true;
}

/**
 * Save to localStorage and IndexedDB; returns success if either layer persisted.
 * Await when the UI must reflect the IDB copy immediately (e.g. offline hydration).
 */
export async function saveFieldRouteCacheDual(payload: {
  routeDate: string;
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

/** Returns false if localStorage save fails. IndexedDB mirror is attempted in the background. */
export function saveFieldRouteCache(payload: {
  routeDate: string;
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
  void saveFieldRouteCacheToIdb(full).catch(() => {});
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
  void clearFieldRouteCacheFromIdb();
}

/** Find a visit row in the last saved offline route snapshot (single-slot cache). */
export function findVisitInFieldRouteCache(visitId: string): FieldVisitListItem | null {
  if (!visitId) return null;
  const p = loadFieldRouteCache();
  if (!p?.visits?.length) return null;
  const row = p.visits.find((v) => v?.id === visitId);
  return row ?? null;
}

/** Prefer IndexedDB snapshot, then localStorage — for visit bootstrap when LS missed or quota failed. */
export async function findVisitInFieldRouteCacheAsync(visitId: string): Promise<FieldVisitListItem | null> {
  if (!visitId) return null;
  const idbPayload = await loadFieldRouteCacheFromIdb();
  if (idbPayload?.visits?.length) {
    const row = idbPayload.visits.find((v) => v?.id === visitId);
    if (row) return row;
  }
  return findVisitInFieldRouteCache(visitId);
}
