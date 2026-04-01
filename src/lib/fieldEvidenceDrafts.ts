import type { SupabaseClient } from '@supabase/supabase-js';
import type { FieldEvidenceAssetRecord } from '@/types';
import { buildFieldEvidenceStoragePath } from '@/lib/fieldEvidenceStoragePath';

const DB_NAME = 'scc-field-evidence-drafts';
const STORE_NAME = 'drafts';
const DB_VERSION = 1;

type StoredDraft = {
  id: string;
  fieldVisitId: string;
  bucket: string;
  pathPrefix: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  evidenceType: FieldEvidenceAssetRecord['evidence_type'];
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  createdAt: string;
  file: Blob;
};

export type FieldEvidenceDraft = Omit<StoredDraft, 'file'>;

export type FieldEvidenceDraftSyncFailure = {
  draftId: string;
  fieldVisitId: string;
  fileName: string;
  message: string;
};

/** Durable across sessions (Phase 4); legacy copies may exist in sessionStorage under the same key */
const SYNC_FAILURES_KEY = 'scc.fieldEvidenceSyncFailures.v1';

type PersistedSyncFailuresPayload = {
  version: 1;
  savedAt: string;
  failures: FieldEvidenceDraftSyncFailure[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseSyncFailuresPayload(raw: string | null): PersistedSyncFailuresPayload | null {
  if (raw == null || raw === '') return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!isRecord(data)) return null;
    if (data.version !== 1) return null;
    if (typeof data.savedAt !== 'string') return null;
    if (!Array.isArray(data.failures)) return null;
    return data as unknown as PersistedSyncFailuresPayload;
  } catch {
    return null;
  }
}

function migrateSessionFailuresToLocal(): void {
  if (typeof sessionStorage === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const legacy = sessionStorage.getItem(SYNC_FAILURES_KEY);
    if (!legacy) return;
    if (!localStorage.getItem(SYNC_FAILURES_KEY)) {
      localStorage.setItem(SYNC_FAILURES_KEY, legacy);
    }
    sessionStorage.removeItem(SYNC_FAILURES_KEY);
  } catch {
    /* ignore */
  }
}

export function readPersistedFieldEvidenceSyncFailures(): FieldEvidenceDraftSyncFailure[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    migrateSessionFailuresToLocal();
    const p = parseSyncFailuresPayload(localStorage.getItem(SYNC_FAILURES_KEY));
    return p?.failures ?? [];
  } catch {
    return [];
  }
}

export function readPersistedFieldEvidenceSyncFailuresForVisit(
  visitId: string,
): FieldEvidenceDraftSyncFailure[] {
  if (!visitId) return [];
  return readPersistedFieldEvidenceSyncFailures().filter((f) => f.fieldVisitId === visitId);
}

export function persistFieldEvidenceSyncFailures(failures: FieldEvidenceDraftSyncFailure[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SYNC_FAILURES_KEY);
    }
    if (failures.length === 0) {
      localStorage.removeItem(SYNC_FAILURES_KEY);
      return;
    }
    const payload: PersistedSyncFailuresPayload = {
      version: 1,
      savedAt: new Date().toISOString(),
      failures,
    };
    localStorage.setItem(SYNC_FAILURES_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function clearPersistedFieldEvidenceSyncFailures(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(SYNC_FAILURES_KEY);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SYNC_FAILURES_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function clearPersistedFieldEvidenceSyncFailuresForVisit(visitId: string): void {
  if (!visitId) return;
  const rest = readPersistedFieldEvidenceSyncFailures().filter((f) => f.fieldVisitId !== visitId);
  persistFieldEvidenceSyncFailures(rest);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable on this device'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Could not open field evidence drafts'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('fieldVisitId', 'fieldVisitId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return openDb().then(async (db) => {
    try {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const result = await run(store);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      });
      return result;
    } finally {
      db.close();
    }
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export async function saveFieldEvidenceDraft(input: {
  fieldVisitId: string;
  bucket: string;
  pathPrefix: string;
  file: File;
  evidenceType: FieldEvidenceAssetRecord['evidence_type'];
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
}): Promise<FieldEvidenceDraft> {
  const draft: StoredDraft = {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    fieldVisitId: input.fieldVisitId,
    bucket: input.bucket,
    pathPrefix: input.pathPrefix,
    fileName: input.file.name,
    mimeType: input.file.type,
    fileSize: input.file.size,
    evidenceType: input.evidenceType,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    notes: input.notes ?? null,
    createdAt: new Date().toISOString(),
    file: input.file,
  };

  await withStore('readwrite', async (store) => {
    await requestToPromise(store.put(draft));
  });

  return {
    id: draft.id,
    fieldVisitId: draft.fieldVisitId,
    bucket: draft.bucket,
    pathPrefix: draft.pathPrefix,
    fileName: draft.fileName,
    mimeType: draft.mimeType,
    fileSize: draft.fileSize,
    evidenceType: draft.evidenceType,
    latitude: draft.latitude,
    longitude: draft.longitude,
    notes: draft.notes,
    createdAt: draft.createdAt,
  };
}

/** Count all drafts in IndexedDB (for Phase 4 sync health: queue + blobs). */
export async function countFieldEvidenceDrafts(): Promise<number> {
  try {
    return await withStore('readonly', async (store) => {
      return await requestToPromise(store.count());
    });
  } catch {
    return 0;
  }
}

export async function listFieldEvidenceDrafts(fieldVisitId: string): Promise<FieldEvidenceDraft[]> {
  return withStore('readonly', async (store) => {
    const index = store.index('fieldVisitId');
    const rows = (await requestToPromise(index.getAll(fieldVisitId))) as StoredDraft[];
    return rows
      .map((draft) => ({
        id: draft.id,
        fieldVisitId: draft.fieldVisitId,
        bucket: draft.bucket,
        pathPrefix: draft.pathPrefix,
        fileName: draft.fileName,
        mimeType: draft.mimeType,
        fileSize: draft.fileSize,
        evidenceType: draft.evidenceType,
        latitude: draft.latitude,
        longitude: draft.longitude,
        notes: draft.notes,
        createdAt: draft.createdAt,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
}

export async function syncFieldEvidenceDrafts(
  client: SupabaseClient,
  input: {
    organizationId: string;
    userId: string;
  },
): Promise<{ uploaded: number; failures: FieldEvidenceDraftSyncFailure[]; syncedVisitIds: string[] }> {
  const drafts = await withStore('readonly', async (store) => {
    const rows = (await requestToPromise(store.getAll())) as StoredDraft[];
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });

  let uploaded = 0;
  const syncedVisitIds = new Set<string>();
  const failures: FieldEvidenceDraftSyncFailure[] = [];

  for (const draft of drafts) {
    try {
      const file = new File([draft.file], draft.fileName, {
        type: draft.mimeType || 'application/octet-stream',
      });
      const storagePath = buildFieldEvidenceStoragePath({
        pathPrefix: draft.pathPrefix,
        referenceId: draft.fieldVisitId,
        fileName: draft.fileName,
      });

      const { error: uploadError } = await client.storage
        .from(draft.bucket)
        .upload(storagePath, file, {
          contentType: draft.mimeType || undefined,
          upsert: false,
        });
      if (uploadError) throw new Error(uploadError.message);

      const { error: insertError } = await client
        .from('field_evidence_assets')
        .insert({
          organization_id: input.organizationId,
          field_visit_id: draft.fieldVisitId,
          governance_issue_id: null,
          storage_path: storagePath,
          bucket: draft.bucket,
          evidence_type: draft.evidenceType,
          uploaded_by: input.userId,
          latitude: draft.latitude,
          longitude: draft.longitude,
          notes: draft.notes,
        });
      if (insertError) {
        await client.storage.from(draft.bucket).remove([storagePath]);
        throw new Error(insertError.message);
      }

      await withStore('readwrite', async (store) => {
        await requestToPromise(store.delete(draft.id));
      });

      uploaded += 1;
      syncedVisitIds.add(draft.fieldVisitId);
    } catch (error) {
      failures.push({
        draftId: draft.id,
        fieldVisitId: draft.fieldVisitId,
        fileName: draft.fileName,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { uploaded, failures, syncedVisitIds: [...syncedVisitIds] };
}
