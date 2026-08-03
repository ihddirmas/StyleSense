-- =================================================================
-- v2j: Consolidate core relational tables back onto Supabase
-- Run in Supabase SQL Editor after prior v2 migrations. Idempotent.
--
-- Adds columns/tables from the temporary split-DB hackathon cutover:
-- cutover: usage_events, wardrobe cutout, body/full-body fields, B2 provenance.
-- =================================================================

-- users: body + style fields (some may already exist from v2g/v2h/v2i)
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_body_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS style_preferences JSONB DEFAULT '[]'::jsonb;

-- wardrobe: transparent cutout for closet grid
ALTER TABLE wardrobe_items ADD COLUMN IF NOT EXISTS cutout_url TEXT;

-- try-ons: saved flag + B2 cold archive provenance
ALTER TABLE try_on_results ADD COLUMN IF NOT EXISTS saved BOOLEAN DEFAULT false;
ALTER TABLE try_on_results ADD COLUMN IF NOT EXISTS b2_image_url TEXT;
ALTER TABLE try_on_results ADD COLUMN IF NOT EXISTS image_manifest_hash TEXT;
ALTER TABLE try_on_results ADD COLUMN IF NOT EXISTS b2_video_url TEXT;
ALTER TABLE try_on_results ADD COLUMN IF NOT EXISTS video_manifest_hash TEXT;

-- usage_events: monthly caps for event-scene / animate + cap-email dedupe ledger
CREATE TABLE IF NOT EXISTS usage_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL CHECK (action IN (
                'event_scene', 'animate',
                'cap_email_tryon', 'cap_email_event_scene', 'cap_email_animate'
              )),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_action
  ON usage_events (user_id, action, created_at DESC);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_events_service_all" ON usage_events;
CREATE POLICY "usage_events_service_all" ON usage_events
  FOR ALL USING (true) WITH CHECK (true);

-- Helpful list indexes (no-op if already present)
CREATE INDEX IF NOT EXISTS idx_wardrobe_user ON wardrobe_items (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tryon_user_saved ON try_on_results (user_id, saved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outfits_user ON outfits (user_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
