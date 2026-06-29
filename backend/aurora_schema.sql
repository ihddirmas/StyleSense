-- =================================================================
-- StyleSense - Aurora PostgreSQL schema (core relational data)
--
-- Consolidated DDL for the 4 tables that moved off Supabase to Aurora:
--   users, wardrobe_items, try_on_results, outfits
-- = the union of supabase_schema.sql + v2d (selfies) + v2e (stylized) +
--   v2f (stylized_video) + v2g (color_profile) + v2h (saved).
--
-- Run once against the Aurora cluster, e.g.:
--   psql "$AURORA_DATABASE_URL" -f backend/aurora_schema.sql
-- (or paste into the RDS Query Editor).
--
-- No RLS / policies: auth is enforced in the API layer (auth_service.current_user)
-- and the backend connects as the cluster's master user. Supabase still owns Auth,
-- Storage, and the social tables (profiles, friendships, messages).
-- Idempotent (IF NOT EXISTS) so it is safe to re-run.
-- =================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                           TEXT,
  full_name                       TEXT,
  avatar_character_id             TEXT,
  avatar_selfie_url               TEXT,
  avatar_voice_id                 TEXT,
  avatar_document_id              TEXT,
  -- v2d
  selfie_urls                     JSONB DEFAULT '[]'::jsonb,
  -- v2e
  stylized_avatar_url             TEXT,
  stylized_avatar_status          TEXT DEFAULT 'idle',
  stylized_avatar_source_selfie   TEXT,
  -- v2f
  stylized_avatar_video_url       TEXT,
  stylized_avatar_video_status    TEXT DEFAULT 'idle',
  stylized_avatar_video_source    TEXT,
  -- v2g
  color_profile                   JSONB,
  color_profile_source_selfie     TEXT,
  -- full-body photo for body-aware styling (selfie stays the face source for try-on)
  full_body_url                   TEXT,
  body_analysis                   JSONB,
  -- v2h
  style_preferences               JSONB DEFAULT '[]'::jsonb,
  created_at                      TIMESTAMPTZ DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ DEFAULT NOW()
);

-- WARDROBE ITEMS
CREATE TABLE IF NOT EXISTS wardrobe_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('tops','bottoms','dresses','outerwear','shoes','accessories')),
  occasion          TEXT CHECK (occasion IN ('casual','formal','evening','sport','beach','any')),
  color             TEXT,
  brand             TEXT,
  tags              TEXT[] DEFAULT '{}',
  image_url         TEXT NOT NULL,
  source_url        TEXT,
  thumbnail_url     TEXT,
  cutout_url        TEXT,        -- transparent PNG for the closet display (try-on uses image_url)
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- TRY-ON RESULTS (+ v2h saved)
CREATE TABLE IF NOT EXISTS try_on_results (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL,
  wardrobe_item_id      UUID,
  result_image_url      TEXT,
  result_video_url      TEXT,
  event_scene_url       TEXT,
  event_context         TEXT,
  prompt_used           TEXT,
  model_used            TEXT,
  runway_task_id        TEXT,
  runway_video_task_id  TEXT,
  status                TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  credits_used          INTEGER,
  saved                 BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- SAVED OUTFITS
CREATE TABLE IF NOT EXISTS outfits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL,
  name              TEXT NOT NULL,
  item_ids          UUID[] NOT NULL DEFAULT '{}',
  occasion          TEXT,
  preview_image_url TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- STYLIST CHAT SESSIONS
CREATE TABLE IF NOT EXISTS stylist_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  messages        JSONB NOT NULL DEFAULT '[]'::jsonb,
  title           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Helpful indexes for the per-user list queries.
CREATE INDEX IF NOT EXISTS idx_wardrobe_user             ON wardrobe_items (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tryon_user_saved          ON try_on_results (user_id, saved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outfits_user              ON outfits (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stylist_sessions_user_updated ON stylist_sessions (user_id, updated_at DESC);

-- Pre-seed the demo user (fixed UUID, mirrors the Supabase schema).
INSERT INTO users (id, email, full_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'demo@styleai.local', 'Demo User')
ON CONFLICT (id) DO NOTHING;
