-- Migration 009: Enable pgvector extension for document embeddings
-- Required for Layer 3 Document Intelligence (RAG)

CREATE EXTENSION IF NOT EXISTS vector
WITH SCHEMA extensions;
