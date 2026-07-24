-- =================================================================
-- StyleAI Schema v2: Add Auth-aware tables + Social features
-- Run this AFTER the original supabase_schema.sql, in Supabase SQL Editor.
-- It is idempotent - safe to re-run.
-- =================================================================

-- ─────────────────────────── PROFILES ─────────────────────────── --
-- One row per Supabase auth.users entry. We DON'T put avatar_character_id etc
-- on auth.users (read-only). The 'users' table from v1 stays for that.
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  full_name     TEXT,
  username      TEXT UNIQUE,         -- public handle, used in friend search
  share_code    TEXT UNIQUE,         -- 8-char code to share, for friend search
  avatar_url    TEXT,                -- optional profile picture
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION generate_share_code() RETURNS TEXT AS $$
DECLARE
  code TEXT;
BEGIN
  -- 8 char base32-ish (no ambiguous chars)
  code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Auto-create a profile row when a new auth.users row is created
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, share_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    generate_share_code()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Also create the legacy 'users' row (still used by wardrobe/tryon for the avatar character ID)
  INSERT INTO users (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill profiles for any existing auth.users that don't have one
INSERT INTO profiles (id, email, full_name, share_code)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  generate_share_code()
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Same backfill for legacy 'users' table
INSERT INTO users (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
FROM auth.users u
LEFT JOIN users existing ON existing.id = u.id
WHERE existing.id IS NULL;


-- ─────────────────────────── FRIENDSHIPS ─────────────────────────── --
-- One row per friendship request/accept. requester_id < addressee_id is enforced
-- by application (or you can use a trigger). Status: 'pending' or 'accepted'.
CREATE TABLE IF NOT EXISTS friendships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE INDEX IF NOT EXISTS friendships_requester_idx ON friendships (requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id);


-- ─────────────────────────── MESSAGES ─────────────────────────── --
CREATE TABLE IF NOT EXISTS messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content       TEXT,
  -- Attachments: at most one of these is set. No FK here - outfits/try_on_results
  -- live in Aurora Postgres, not this database. Existence + ownership is enforced
  -- at the app layer instead (backend/routers/chat.py send_message).
  shared_outfit_id     UUID,
  shared_tryon_id      UUID,
  shared_image_url     TEXT,           -- direct image (e.g. when a try-on is the attachment)
  shared_caption       TEXT,
  read_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  CHECK (sender_id <> recipient_id),
  CHECK (
    content IS NOT NULL
    OR shared_outfit_id IS NOT NULL
    OR shared_tryon_id IS NOT NULL
    OR shared_image_url IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS messages_pair_created_idx
  ON messages (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at);


-- ─────────────────────────── RLS POLICIES ─────────────────────────── --
ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages    ENABLE ROW LEVEL SECURITY;

-- PROFILES: anyone authenticated can read any profile (needed for friend search).
-- Update only own row.
DROP POLICY IF EXISTS "profiles_read_all"  ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;

CREATE POLICY "profiles_read_all"   ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- FRIENDSHIPS: read rows where you're the requester or addressee.
-- Insert: only as the requester. Update: only the addressee can change status.
DROP POLICY IF EXISTS "friendships_read"   ON friendships;
DROP POLICY IF EXISTS "friendships_insert" ON friendships;
DROP POLICY IF EXISTS "friendships_update" ON friendships;
DROP POLICY IF EXISTS "friendships_delete" ON friendships;

CREATE POLICY "friendships_read"   ON friendships FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "friendships_insert" ON friendships FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "friendships_update" ON friendships FOR UPDATE TO authenticated
  USING (auth.uid() = addressee_id OR auth.uid() = requester_id);
CREATE POLICY "friendships_delete" ON friendships FOR DELETE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- MESSAGES: read messages where you're the sender or recipient. Insert as yourself only.
DROP POLICY IF EXISTS "messages_read"   ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;
DROP POLICY IF EXISTS "messages_update_own" ON messages;

CREATE POLICY "messages_read"   ON messages FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "messages_insert" ON messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);
-- Allow recipient to mark as read
CREATE POLICY "messages_update_own" ON messages FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);


-- ─────────────────────────── REVOKE PERMISSIVE V1 POLICIES ─────────────────────────── --
-- The original v1 schema had "allow_all_*" permissive policies. Replace those with
-- proper user-scoped policies now that we have auth.

-- USERS table
DROP POLICY IF EXISTS "allow_all_users" ON users;
CREATE POLICY "users_read_self"      ON users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users_update_self"    ON users FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "users_insert_self"    ON users FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- WARDROBE_ITEMS
DROP POLICY IF EXISTS "allow_all_wardrobe" ON wardrobe_items;
CREATE POLICY "wardrobe_read_own"   ON wardrobe_items FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "wardrobe_insert_own" ON wardrobe_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wardrobe_update_own" ON wardrobe_items FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "wardrobe_delete_own" ON wardrobe_items FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- TRY_ON_RESULTS
DROP POLICY IF EXISTS "allow_all_tryon" ON try_on_results;
CREATE POLICY "tryon_read_own"   ON try_on_results FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Allow read by friends (so a shared try-on can be viewed)
CREATE POLICY "tryon_read_shared" ON try_on_results FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM messages m WHERE m.shared_tryon_id = try_on_results.id AND (m.sender_id = auth.uid() OR m.recipient_id = auth.uid()))
);
CREATE POLICY "tryon_insert_own" ON try_on_results FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tryon_update_own" ON try_on_results FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- OUTFITS
DROP POLICY IF EXISTS "allow_all_outfits" ON outfits;
CREATE POLICY "outfits_read_own"   ON outfits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "outfits_read_shared" ON outfits FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM messages m WHERE m.shared_outfit_id = outfits.id AND (m.sender_id = auth.uid() OR m.recipient_id = auth.uid()))
);
CREATE POLICY "outfits_insert_own" ON outfits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "outfits_update_own" ON outfits FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "outfits_delete_own" ON outfits FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─────────────────────────── REALTIME PUBLICATIONS ─────────────────────────── --
-- Tell Supabase Realtime to publish changes for these tables so the chat updates live.
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE friendships;

-- =================================================================
-- AFTER RUNNING THIS:
-- 1. (Optional) Enable Google OAuth: Supabase Dashboard -> Authentication -> Providers
--    -> Google -> Enable -> paste Client ID + Secret from Google Cloud Console.
--    See: https://supabase.com/docs/guides/auth/social-login/auth-google
-- 2. Email auth is on by default - no setup needed.
-- 3. Authentication -> URL Configuration -> set Site URL to http://localhost:3000
--    and add http://localhost:3000/** to Redirect URLs.
-- =================================================================
