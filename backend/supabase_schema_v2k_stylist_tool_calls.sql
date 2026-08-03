-- Agentic stylist: server-side tool proposal ledger (human-in-the-loop confirm).
-- Applied via Supabase MCP migration stylist_tool_calls (2026-08-01).

CREATE TABLE IF NOT EXISTS stylist_tool_calls (
  tool_use_id     TEXT PRIMARY KEY,
  user_id         UUID NOT NULL,
  tool_name       TEXT NOT NULL,
  tool_input      JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'proposed',
  result_summary  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stylist_tool_calls_user ON stylist_tool_calls (user_id, created_at DESC);

ALTER TABLE stylist_tool_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stylist_tool_calls_service_all" ON stylist_tool_calls;
CREATE POLICY "stylist_tool_calls_service_all" ON stylist_tool_calls
  FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
