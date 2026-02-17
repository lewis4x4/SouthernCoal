-- Migration 019: Add 'embedded' and 'embedding_failed' to queue status CHECK
-- Required for generate-embeddings to mark completion/quarantine

ALTER TABLE file_processing_queue DROP CONSTRAINT file_processing_queue_status_check;

ALTER TABLE file_processing_queue ADD CONSTRAINT file_processing_queue_status_check CHECK (
  status = ANY (ARRAY[
    'uploaded'::text, 'queued'::text, 'processing'::text,
    'parsed'::text, 'validated'::text, 'imported'::text,
    'failed'::text, 'skipped'::text, 'archived'::text,
    'embedded'::text, 'embedding_failed'::text
  ])
);
