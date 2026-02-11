-- Migration 010: Create document_chunks table for RAG embeddings
-- Stores chunked text + vector embeddings from parsed compliance documents

-- Clean up partial state from any prior failed attempt
DROP TABLE IF EXISTS document_chunks CASCADE;

CREATE TABLE document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Document references
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  queue_entry_id uuid REFERENCES file_processing_queue(id) ON DELETE SET NULL,

  -- Tenant isolation
  organization_id uuid NOT NULL REFERENCES organizations(id),

  -- Chunk content
  chunk_index integer NOT NULL,
  chunk_text text NOT NULL,
  chunk_chars integer,

  -- Page-level source tracking (required — not optional)
  source_page integer NOT NULL DEFAULT 0,
  source_section text,

  -- Metadata for filtering (denormalized from queue/documents)
  document_type text,
  state_code text REFERENCES states(code),
  permit_number text,
  site_id uuid REFERENCES sites(id),
  file_name text,

  -- Vector embedding (gte-small = 384 dims)
  embedding extensions.vector(384),

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org chunks"
ON document_chunks FOR SELECT
TO authenticated
USING (organization_id = get_user_org_id());

CREATE POLICY "Service role can manage chunks"
ON document_chunks FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Lookup indexes
CREATE INDEX idx_dc_document_id ON document_chunks(document_id);
CREATE INDEX idx_dc_org_id ON document_chunks(organization_id);
CREATE INDEX idx_dc_document_type ON document_chunks(document_type);
CREATE INDEX idx_dc_state_code ON document_chunks(state_code);
CREATE INDEX idx_dc_permit_number ON document_chunks(permit_number);

-- NOTE: Vector index deferred. Exact scan is fast for <10K chunks.
-- Add HNSW/IVFFlat index after confirming pgvector version supports it.

-- Idempotency constraint
ALTER TABLE document_chunks
ADD CONSTRAINT dc_doc_chunk_unique
UNIQUE (document_id, chunk_index);
