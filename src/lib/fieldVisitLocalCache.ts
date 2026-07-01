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

function buildEnvelope(detail: FieldVisitDetails, scope: FieldVisitCacheScope): FieldVisitCacheEnvelope | null {
  if (!scope.organizationId || !scope.viewerUserId) return null;
  if (detail.visit.organization_id !== scope.organizationId) return null;
  return {
    version: FIELD_VISIT_CACHE_VERSION,
    visitId: detail.visit.id,
    organizationId: scope.organizationId,
    viewerUserId: scope.viewerUserId,
    detail,
  };
}

function envelopeMatchesScope(
  envelope: FieldVisitCacheEnvelope,
  visitId: string,
  scope: FieldVisitCacheScope,
): boolean {
  return (
    envelope.visitId === visitId
    && envelope.organizationId === scope.organizationId
    && envelope.viewerUserId === scope.viewerUserId
    && envelope.detail.visit.id === visitId
    && envelope.detail.visit.organization_id === scope.organizationId
  );
}

const VISIT_CACHE_IDB = 'scc-field-visit-cache';
const VISIT_CACHE_STORE = 'details';
const VISIT_CACHE_IDB_VERSION = 1;

function openVisitCacheIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(VISIT_CACHE_IDB, VISIT_CACHE_IDB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VISIT_CACHE_STORE)) {
        db.createObjectStore(VISIT_CACHE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function loadFieldVisitCacheFromIdb(
  visitId: string,
  scope: FieldVisitCacheScope,
): Promise<FieldVisitDetails | null> {
  if (typeof indexedDB === 'undefined') return null;
  if (!scope.organizationId || !scope.viewerUserId) return null;
  try {
    const db = await openVisitCacheIdb();
    try {
      const tx = db.transaction(VISIT_CACHE_STORE, 'readonly');
      const store = tx.objectStore(VISIT_CACHE_STORE);
      const raw: unknown = await new Promise((resolve, reject) => {
        const r = store.get(visitId);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error ?? new Error('IDB get failed'));
      });
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error ?? new Error('IDB tx failed'));
      });
      const data = raw as FieldVisitCacheEnvelope | null;
      if (!data || data.version !== FIELD_VISIT_CACHE_VERSION) return null;
      if (!envelopeMatchesScope(data, visitId, scope)) {
        void clearFieldVisitCacheFromIdb(visitId);
        return null;
      }
      return data.detail;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** Prefer IndexedDB (larger quota), then localStorage — M2 durable visit context. */
export async function loadFieldVisitCacheAsync(
  visitId: string,
  scope: FieldVisitCacheScope,
): Promise<FieldVisitDetails | null> {
  const fromIdb = await loadFieldVisitCacheFromIdb(visitId, scope);
  if (fromIdb) return fromIdb;
  return loadFieldVisitCache(visitId, scope);
}

export async function saveFieldVisitCacheToIdb(
  detail: FieldVisitDetails,
  scope: FieldVisitCacheScope,
): Promise<boolean> {
  const envelope = buildEnvelope(detail, scope);
  if (!envelope) return false;
  if (typeof indexedDB === 'undefined') return false;
  try {
    const db = await openVisitCacheIdb();
    try {
      const tx = db.transaction(VISIT_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(VISIT_CACHE_STORE);
      await new Promise<void>((resolve, reject) => {
        const r = store.put(envelope, envelope.visitId);
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

export function saveFieldVisitCache(detail: FieldVisitDetails, scope: FieldVisitCacheScope): boolean {
  if (typeof localStorage === 'undefined') return false;
  const envelope = buildEnvelope(detail, scope);
  if (!envelope) return false;
  try {
    localStorage.setItem(storageKey(detail.visit.id), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

/** Persist to localStorage and IndexedDB; succeeds if either layer accepts the write. */
export async function saveFieldVisitCacheDual(
  detail: FieldVisitDetails,
  scope: FieldVisitCacheScope,
): Promise<{ ok: boolean; localStorage: boolean; indexedDb: boolean }> {
  const lsOk = saveFieldVisitCache(detail, scope);
  const idbOk = await saveFieldVisitCacheToIdb(detail, scope);
  return { ok: lsOk || idbOk, localStorage: lsOk, indexedDb: idbOk };
}

export async function clearFieldVisitCacheFromIdb(visitId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openVisitCacheIdb();
    try {
      const tx = db.transaction(VISIT_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(VISIT_CACHE_STORE);
      await new Promise<void>((resolve, reject) => {
        const r = store.delete(visitId);
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

export function clearFieldVisitCache(visitId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(visitId));
  } catch {
    /* ignore */
  }
  void clearFieldVisitCacheFromIdb(visitId);
}

export async function clearAllFieldVisitCachesFromIdb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openVisitCacheIdb();
    try {
      const tx = db.transaction(VISIT_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(VISIT_CACHE_STORE);
      await new Promise<void>((resolve, reject) => {
        const r = store.clear();
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error ?? new Error('IDB clear failed'));
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
  void clearAllFieldVisitCachesFromIdb();
}
