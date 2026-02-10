import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useUploadStore } from '@/stores/upload';
import { useStagingStore } from '@/stores/staging';
import { useQueueStore } from '@/stores/queue';
import { useUserProfile } from './useUserProfile';
import { CATEGORY_BY_DB_KEY } from '@/lib/constants';
import type { StagedFile } from '@/types/upload';
import type { QueueEntry } from '@/types/queue';

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

  /**
   * Get a fresh auth token before each upload.
   * v6 Section 11: refresh if expiring within 60 seconds.
   */
  async function getFreshToken(): Promise<string> {
    const { data: { session }, error } = await supabase.auth.getSession();

    // Session missing or expired — try refresh before redirecting
    if (error || !session) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session) {
        window.location.href = '/login?reason=session_expired';
        throw new Error('Session expired');
      }
      return refreshed.session.access_token;
    }

    const expiresAt = session.expires_at ?? 0;
    const now = Math.floor(Date.now() / 1000);
    const REFRESH_THRESHOLD = 60;

    if (expiresAt - now < REFRESH_THRESHOLD) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session) {
        window.location.href = '/login?reason=refresh_failed';
        throw new Error('Token refresh failed');
      }
      return refreshed.session.access_token;
    }

    return session.access_token;
  }

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
   * Check for duplicate file hash in the queue.
   * RLS already scopes to user's org via uploaded_by → user_profiles chain.
   */
  async function checkDuplicate(
    fileHash: string,
    storageBucket: string,
    organizationId?: string | null,
  ): Promise<boolean> {
    const baseQuery = supabase
      .from('file_processing_queue')
      .select('id')
      .eq('file_hash', fileHash)
      .eq('storage_bucket', storageBucket)
      .limit(1);

    if (organizationId) {
      const { data, error } = await baseQuery.eq('organization_id', organizationId);
      if (error) {
        // Fallback for older schemas without organization_id
        if (error.message.includes('organization_id')) {
          const { data: fallback } = await baseQuery;
          return (fallback?.length ?? 0) > 0;
        }
        console.error('[upload] Duplicate check failed:', error.message);
        return false;
      }
      return (data?.length ?? 0) > 0;
    }

    const { data, error } = await baseQuery;
    if (error) {
      console.error('[upload] Duplicate check failed:', error.message);
      return false;
    }

    return (data?.length ?? 0) > 0;
  }

  /**
   * Upload a single staged file.
   */
  const uploadFile = useCallback(
    async (stagedFile: StagedFile) => {
      // Use hook profile directly — no fallback query to avoid pool exhaustion
      if (!profile) {
        toast.error('Profile not loaded yet. Please wait a moment and try again.');
        return;
      }
      const userProfile = { id: profile.id, organization_id: profile.organization_id };

      const uploadStore = useUploadStore.getState();
      if (!uploadStore.canStartUpload()) {
        toast.info(`Upload queue is full. Waiting for a slot...`);
        return;
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

        // 3. Check for duplicates (tenant-scoped when possible)
        const isDuplicate = await checkDuplicate(
          hashHex,
          categoryConfig.bucket,
          userProfile.organization_id,
        );
        if (isDuplicate) {
          uploadStore.completeUpload(stagedFile.id);
          toast.warning('This file has already been uploaded (matching file hash).');
          return;
        }

        // 4. Get fresh auth token (ensures session is valid for storage upload)
        await getFreshToken();

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

        const insertPayloadWithOrg = {
          ...insertPayloadBase,
          organization_id: userProfile.organization_id ?? null,
        };

        let insertError: Error | null = null;
        let insertedId: string | null = null;

        const attemptInsert = async (payload: typeof insertPayloadBase) => {
          const { data, error } = await supabase
            .from('file_processing_queue')
            .insert(payload)
            .select('id')
            .single();
          insertError = error ? new Error(error.message) : null;
          insertedId = (data as { id?: string } | null)?.id ?? null;
        };

        await attemptInsert(insertPayloadWithOrg);

        if (insertError && (insertError as Error).message.includes('organization_id')) {
          // Fallback for schemas without organization_id
          insertError = null;
          insertedId = null;
          await attemptInsert(insertPayloadBase);
        }

        if (insertError || !insertedId) {
          // Clean up the storage file since the queue row failed
          await supabase.storage.from(categoryConfig.bucket).remove([storagePath]);
          const message = (insertError as Error | null)?.message ?? 'Queue insert failed';
          throw new Error(`Queue insert failed: ${message}`);
        }

        console.log('[upload] Queue row created:', insertedId);

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
    [profile, getWorker],
  );

  /**
   * Upload all ready files in the staging area — sequentially, one at a time.
   */
  const uploadAll = useCallback(async () => {
    const readyFiles = useStagingStore.getState().getReadyFiles();
    if (readyFiles.length === 0) {
      toast.info('No files ready to upload.');
      return;
    }

    toast.info(`Uploading ${readyFiles.length} file${readyFiles.length > 1 ? 's' : ''} sequentially...`);

    for (const file of readyFiles) {
      await uploadFile(file);
      // Small delay between sequential uploads
      await new Promise((r) => setTimeout(r, 300));
    }
  }, [uploadFile]);

  return { uploadFile, uploadAll };
}
