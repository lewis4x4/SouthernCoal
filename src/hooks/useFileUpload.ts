import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { supabase, getFreshToken } from '@/lib/supabase';
import { useUploadStore, UPLOAD_CONCURRENCY } from '@/stores/upload';
import { useStagingStore } from '@/stores/staging';
import { useQueueStore } from '@/stores/queue';
import { useUserProfile } from './useUserProfile';
import { CATEGORY_BY_DB_KEY } from '@/lib/constants';
import {
  DUPLICATE_UPLOAD_MESSAGE,
  hasOrgScopedDuplicate,
  isOrgScopedDedupViolation,
} from '@/lib/uploadDedup';
import type { StagedFile } from '@/types/upload';
import type { QueueEntry } from '@/types/queue';

const SLOT_POLL_MS = 150;

async function waitForUploadSlot(): Promise<void> {
  while (!useUploadStore.getState().canStartUpload()) {
    await new Promise((r) => setTimeout(r, SLOT_POLL_MS));
  }
}

interface UploadFileOptions {
  /** When true, wait for a concurrency slot instead of bailing (batch uploads). */
  waitForSlot?: boolean;
}

/**
 * Upload orchestrator — handles the full pipeline:
 * 1. JIT hash computation (capped at 2 concurrent workers)
 * 2. 10-slot upload concurrency
 * 3. getFreshToken() before each upload (v6 Section 11)
 * 4. Supabase Storage upload
 * 5. Direct INSERT into file_processing_queue
 * 6. Duplicate detection by file hash
 */
export function useFileUpload() {
  const { profile } = useUserProfile();
  const workerRef = useRef<Worker | null>(null);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('@/workers/hash-worker.ts', import.meta.url),
        { type: 'module' },
      );
    }
    return workerRef.current;
  }, []);

  // Terminate Web Worker on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  /**
   * Compute SHA-256 hash in Web Worker (JIT — only when file is about to upload).
   */
  function computeHash(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const worker = getWorker();

      const handler = (e: MessageEvent) => {
        worker.removeEventListener('message', handler);
        useUploadStore.getState().completeHash();

        if (e.data.type === 'error') {
          reject(new Error(e.data.error));
        } else {
          resolve(e.data.hash);
        }
      };

      worker.addEventListener('message', handler);
      useUploadStore.getState().startHash();

      file.arrayBuffer().then(
        (buffer) => worker.postMessage(buffer, [buffer]),
        (err) => {
          useUploadStore.getState().completeHash();
          reject(err);
        },
      );
    });
  }

  /**
   * Check for duplicate file hash in the queue (org-scoped).
   * RLS also scopes reads to the user's organization.
   */
  async function checkDuplicate(
    fileHash: string,
    storageBucket: string,
    organizationId?: string | null,
  ): Promise<boolean> {
    if (!organizationId) {
      console.warn('[upload] Duplicate check skipped — missing organization_id');
      return false;
    }

    const { data, error } = await supabase
      .from('file_processing_queue')
      .select('id')
      .eq('file_hash', fileHash)
      .eq('storage_bucket', storageBucket)
      .eq('organization_id', organizationId)
      .limit(1);

    if (error) {
      console.error('[upload] Duplicate check failed:', error.message);
      return false;
    }

    return hasOrgScopedDuplicate(data);
  }

  /**
   * Upload a single staged file.
   */
  const uploadFile = useCallback(
    async (stagedFile: StagedFile, options?: UploadFileOptions) => {
      // Use hook profile directly — no fallback query to avoid pool exhaustion
      if (!profile) {
        toast.error('Profile not loaded yet. Please wait a moment and try again.');
        return;
      }
      const userProfile = { id: profile.id, organization_id: profile.organization_id };

      if (!userProfile.organization_id) {
        toast.error('Your account is missing an organization assignment. Contact an administrator.');
        return;
      }

      const uploadStore = useUploadStore.getState();
      if (!uploadStore.canStartUpload()) {
        if (options?.waitForSlot) {
          await waitForUploadSlot();
        } else {
          toast.info(`Upload queue is full. Waiting for a slot...`);
          return;
        }
      }

      const effectiveCategory = stagedFile.manualOverride?.category ?? stagedFile.autoClassification?.category ?? 'other';
      const effectiveState = stagedFile.manualOverride?.state ?? stagedFile.autoClassification?.stateCode ?? undefined;
      const categoryConfig = CATEGORY_BY_DB_KEY[effectiveCategory];

      if (!categoryConfig) {
        toast.error(`Unknown category: ${effectiveCategory}`);
        return;
      }

      try {
        // 1. Set status to hashing
        uploadStore.startUpload(stagedFile.id);
        uploadStore.setStatus(stagedFile.id, 'hashing');

        // 2. JIT hash computation
        const hashHex = await computeHash(stagedFile.file);
        const hashPrefix = hashHex.slice(0, 8);

        // Update staged file with hash
        useStagingStore.getState().updateFile(stagedFile.id, { hashHex });

        // 3. Get fresh auth token BEFORE any server calls (prevents stale-token edge cases)
        await getFreshToken();

        // 4. Check for duplicates (tenant-scoped when possible)
        const isDuplicate = await checkDuplicate(
          hashHex,
          categoryConfig.bucket,
          userProfile.organization_id,
        );
        if (isDuplicate) {
          uploadStore.completeUpload(stagedFile.id);
          toast.warning(DUPLICATE_UPLOAD_MESSAGE);
          return;
        }

        // 5. Build storage path
        const storagePath = categoryConfig.buildPath({
          stateCode: effectiveState,
          fileName: stagedFile.fileName,
          hashPrefix,
        });

        // 6. Upload to Supabase Storage
        uploadStore.setStatus(stagedFile.id, 'uploading');
        const { error: storageError } = await supabase.storage
          .from(categoryConfig.bucket)
          .upload(storagePath, stagedFile.file, {
            contentType: stagedFile.mimeType || undefined,
            upsert: false,
          });

        if (storageError) {
          throw new Error(`Storage upload failed: ${storageError.message}`);
        }

        // 7. INSERT directly into file_processing_queue
        // (Bypasses Edge Function — inserts via client with RLS)
        const insertPayloadBase = {
          storage_bucket: categoryConfig.bucket,
          storage_path: storagePath,
          file_name: stagedFile.fileName,
          file_size_bytes: stagedFile.fileSize,
          mime_type: stagedFile.mimeType,
          file_hash: hashHex,
          file_category: effectiveCategory,
          state_code: effectiveState ?? null,
          status: 'queued',
          uploaded_by: userProfile.id,
        };

        const insertPayload = {
          ...insertPayloadBase,
          organization_id: userProfile.organization_id,
        };

        const { data, error } = await supabase
          .from('file_processing_queue')
          .insert(insertPayload)
          .select('id')
          .single();

        const insertError = error ? error : null;
        const insertedId = (data as { id?: string } | null)?.id ?? null;

        if (insertError) {
          await supabase.storage.from(categoryConfig.bucket).remove([storagePath]);

          if (isOrgScopedDedupViolation(insertError)) {
            uploadStore.completeUpload(stagedFile.id);
            toast.warning(DUPLICATE_UPLOAD_MESSAGE);
            return;
          }

          throw new Error(`Queue insert failed: ${insertError.message}`);
        }

        if (!insertedId) {
          await supabase.storage.from(categoryConfig.bucket).remove([storagePath]);
          throw new Error('Queue insert failed: no row returned');
        }

        if (import.meta.env.DEV) console.log('[upload] Queue row created:', insertedId);

        // 8. Add an optimistic row (Realtime will hydrate full row)
        const nowIso = new Date().toISOString();
        useQueueStore.getState().upsertEntry({
          id: insertedId,
          storage_bucket: categoryConfig.bucket,
          storage_path: storagePath,
          file_name: stagedFile.fileName,
          file_size_bytes: stagedFile.fileSize,
          mime_type: stagedFile.mimeType,
          file_hash: hashHex,
          file_category: effectiveCategory,
          state_code: effectiveState ?? null,
          status: 'queued',
          processing_started_at: null,
          processing_completed_at: null,
          records_extracted: 0,
          records_imported: 0,
          records_failed: 0,
          error_log: null,
          extracted_data: null,
          document_id: null,
          data_import_id: null,
          uploaded_by: userProfile.id,
          organization_id: userProfile.organization_id ?? null,
          r2_archived: false,
          r2_archive_path: null,
          r2_archived_at: null,
          created_at: nowIso,
          updated_at: nowIso,
        } as QueueEntry);

        // 9. Success — remove from staging
        useStagingStore.getState().removeFile(stagedFile.id);
        uploadStore.completeUpload(stagedFile.id);

        toast.success(`${stagedFile.fileName} uploaded successfully.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        uploadStore.failUpload(stagedFile.id, message);
        toast.error(`Failed to upload ${stagedFile.fileName}: ${message}`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- computeHash is stable (uses getWorker)
    [profile, getWorker],
  );

  /**
   * Upload all ready files — parallel worker pool capped at UPLOAD_CONCURRENCY.
   */
  const uploadAll = useCallback(async () => {
    const readyFiles = useStagingStore.getState().getReadyFiles();
    if (readyFiles.length === 0) {
      toast.info('No files ready to upload.');
      return;
    }

    toast.info(
      `Uploading ${readyFiles.length} file${readyFiles.length > 1 ? 's' : ''} ` +
      `(up to ${UPLOAD_CONCURRENCY} concurrent)...`,
    );

    let nextIndex = 0;
    const workerCount = Math.min(UPLOAD_CONCURRENCY, readyFiles.length);

    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < readyFiles.length) {
        const fileIndex = nextIndex;
        nextIndex += 1;
        const file = readyFiles[fileIndex];
        if (!file) continue;
        await uploadFile(file, { waitForSlot: true });
      }
    });

    await Promise.all(workers);
  }, [uploadFile]);

  return { uploadFile, uploadAll };
}
