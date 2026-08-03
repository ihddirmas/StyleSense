-- v2l: Long-term Aria memory (verdict feedback, loves/avoid, budget) — Phase 1 agent core
-- Apply in Supabase SQL Editor (idempotent).

ALTER TABLE users ADD COLUMN IF NOT EXISTS aria_memory JSONB DEFAULT '{}'::jsonb;
