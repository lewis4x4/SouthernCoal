-- Migration 012: Deduplicate document_chunks created by backfill loop
-- Keeps the newest chunk per (queue_entry_id, chunk_index), deletes older duplicates

DELETE FROM document_chunks
WHERE id NOT IN (
  SELECT DISTINCT ON (queue_entry_id, chunk_index) id
  FROM document_chunks
  ORDER BY queue_entry_id, chunk_index, created_at DESC
);
