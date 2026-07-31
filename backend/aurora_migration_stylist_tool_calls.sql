-- Server-side record of tool calls Aria proposes (add_wardrobe_items, and future
-- credit-spending/mutating tools). tool_input stores exactly what build_pending_action
-- constructed at propose time, so /tool-confirm executes that -- never whatever
-- tool_input a client echoes back in the confirm request.
--
-- status flow: proposed -> executing -> done | failed
--                        -> cancelled (user declined)
-- The proposed -> executing transition is a conditional UPDATE (see
-- supabase_service.claim_stylist_tool_call), so a double-click or retried confirm
-- can never execute the same tool_use_id twice.
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
