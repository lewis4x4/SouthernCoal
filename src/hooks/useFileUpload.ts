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
 * 4. Supabase Storage upload + Edge Function call
 * 5. Optimistic queue injection
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

    if (error || !session) {
      window.location.href = '/login?reason=session_expired';
      throw new Error('Session expired');
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
   * Resolve user profile — use hook value, fall back to direct query.
   * Handles race where hook hasn't loaded yet when user clicks Upload.
   */
  async function resolveProfile(): Promise<{ id: string; organization_id: string } | null> {
    if (profile) return { id: profile.id, organization_id: profile.organization_id };

    // Hook hasn't resolved yet — try auth + direct query
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;

    const { data } = await supabase
      .from('user_profiles')
      .select('id, organization_id')
      .eq('id', session.user.id)
      .single();

    return data ?? null;
  }

  /**
   * Upload a single staged file.
   */
  const uploadFile = useCallback(
    async (stagedFile: StagedFile) => {
      const userProfile = await resolveProfile();
      if (!userProfile) {
        toast.error('You must be signed in to upload files.');
        return;
      }

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

        // 3. Get fresh auth token
        const token = await getFreshToken();

        // 4. Build storage path
        const storagePath = categoryConfig.buildPath({
          stateCode: effectiveState,
          fileName: stagedFile.fileName,
          hashPrefix,
        });

        // 5. Upload to Supabase Storage
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

        // 6. Inject optimistic queue row
        const tempId = `temp-${crypto.randomUUID()}`;
        const optimisticEntry: QueueEntry = {
          id: tempId,
          storage_bucket: categoryConfig.bucket,
          storage_path: storagePath,
          file_name: stagedFile.fileName,
          file_size_bytes: stagedFile.fileSize,
          mime_type: stagedFile.mimeType,
          file_hash: hashHex,
          file_category: effectiveCategory,
          state_code: effectiveState ?? null,
          status: 'uploaded',
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
          organization_id: userProfile.organization_id,
          r2_archived: false,
          r2_archive_path: null,
          r2_archived_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        useQueueStore.getState().upsertEntry(optimisticEntry);

        // 7. Call file-upload-handler Edge Function
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const response = await fetch(
          `${supabaseUrl}/functions/v1/file-upload-handler`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              bucket: categoryConfig.bucket,
              path: storagePath,
              fileName: stagedFile.fileName,
              fileSize: stagedFile.fileSize,
              mimeType: stagedFile.mimeType,
              stateCode: effectiveState,
              category: effectiveCategory,
              organizationId: userProfile.organization_id, // v6 Section 3: tenant-scoped dedup
              // TODO: MULTI-TENANT — current UNIQUE constraint is global, not org-scoped
            }),
          },
        );

        const result = await response.json();

        if (result.status === 'duplicate') {
          // Remove optimistic row
          useQueueStore.getState().removeEntry(tempId);
          toast.warning('This file has already been uploaded (matching file hash).');
          uploadStore.completeUpload(stagedFile.id);
          return;
        }

        if (result.status === 'error') {
          useQueueStore.getState().removeEntry(tempId);
          throw new Error(result.error || 'Upload handler returned error');
        }

        // Success — remove from staging, update optimistic row with real ID
        useStagingStore.getState().removeFile(stagedFile.id);
        uploadStore.completeUpload(stagedFile.id);

        // The Realtime subscription will swap the optimistic row for the real record
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
   * Upload all ready files in the staging area.
   */
  const uploadAll = useCallback(async () => {
    const readyFiles = useStagingStore.getState().getReadyFiles();
    if (readyFiles.length === 0) {
      toast.info('No files ready to upload.');
      return;
    }

    for (const file of readyFiles) {
      // Respect concurrency limit — wait if full
      while (!useUploadStore.getState().canStartUpload()) {
        await new Promise((r) => setTimeout(r, 500));
      }
      // Fire and don't await — concurrency managed by the store
      uploadFile(file);
    }
  }, [uploadFile]);

  return { uploadFile, uploadAll };
}
