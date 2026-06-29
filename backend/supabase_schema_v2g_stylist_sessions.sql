-- =================================================================
-- StyleAI: Stylist chat sessions table
-- Run this in Supabase Dashboard → SQL Editor
-- =================================================================

CREATE TABLE IF NOT EXISTS stylist_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages        JSONB NOT NULL DEFAULT '[]',
  title           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stylist_sessions_user_updated
  ON stylist_sessions (user_id, updated_at DESC);

-- RLS
ALTER TABLE stylist_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_stylist_sessions" ON stylist_sessions;
CREATE POLICY "allow_all_stylist_sessions" ON stylist_sessions
  FOR ALL USING (true) WITH CHECK (true);