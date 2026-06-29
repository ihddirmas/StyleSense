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

-- RLS: backend uses service-role (bypasses RLS); anon/authenticated keys are
-- scoped to their own rows only, preventing IDOR via direct Supabase access.
ALTER TABLE stylist_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_stylist_sessions" ON stylist_sessions;
DROP POLICY IF EXISTS "stylist_sessions_select_own" ON stylist_sessions;
DROP POLICY IF EXISTS "stylist_sessions_insert_own" ON stylist_sessions;
DROP POLICY IF EXISTS "stylist_sessions_update_own" ON stylist_sessions;
DROP POLICY IF EXISTS "stylist_sessions_delete_own" ON stylist_sessions;

CREATE POLICY "stylist_sessions_select_own" ON stylist_sessions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "stylist_sessions_insert_own" ON stylist_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "stylist_sessions_update_own" ON stylist_sessions
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "stylist_sessions_delete_own" ON stylist_sessions
  FOR DELETE USING (user_id = auth.uid());