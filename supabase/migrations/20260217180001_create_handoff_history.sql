-- Handoff history for tracking AI-processed task updates
-- Part of Intelligent Handoff Processor feature

-- Create update_updated_at function if not exists
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create handoff_history table
CREATE TABLE IF NOT EXISTS handoff_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  organization_id uuid REFERENCES organizations(id),

  -- Input data
  input_source_type text NOT NULL CHECK (input_source_type IN ('email', 'text', 'call', 'document', 'paste', 'file')),
  raw_content text,
  attachment_path text,
  file_name text,
  file_mime_type text,
  source_date date,

  -- AI extraction results
  extracted_text text,
  task_matches jsonb DEFAULT '[]'::jsonb,
  unmatched_items jsonb DEFAULT '[]'::jsonb,
  match_count int DEFAULT 0,
  extraction_confidence numeric(3,2),
  ai_reasoning text,
  processing_time_ms int,

  -- Review workflow
  status text DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'partial')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_notes text,

  -- Applied changes tracking
  applied_task_ids uuid[] DEFAULT '{}',
  applied_at timestamptz,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_handoff_history_user ON handoff_history(user_id);
CREATE INDEX IF NOT EXISTS idx_handoff_history_status ON handoff_history(status) WHERE status = 'pending_review';
CREATE INDEX IF NOT EXISTS idx_handoff_history_created ON handoff_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_handoff_history_org ON handoff_history(organization_id) WHERE organization_id IS NOT NULL;

-- Enable RLS
ALTER TABLE handoff_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own handoffs
CREATE POLICY "Users view own handoffs"
  ON handoff_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own handoffs
CREATE POLICY "Users insert own handoffs"
  ON handoff_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own pending handoffs
CREATE POLICY "Users update own pending handoffs"
  ON handoff_history FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending_review');

-- Updated timestamp trigger
DROP TRIGGER IF EXISTS handoff_history_updated ON handoff_history;
CREATE TRIGGER handoff_history_updated
  BEFORE UPDATE ON handoff_history
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add audit log action type for handoff operations
INSERT INTO audit_log (action, details, user_id)
SELECT 'handoff_history_table_created', '{"migration": "20260217180001"}', (SELECT id FROM auth.users LIMIT 1)
WHERE EXISTS (SELECT 1 FROM auth.users LIMIT 1);
