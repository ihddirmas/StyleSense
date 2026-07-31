-- Kibbe body type analysis columns for the users table.
-- Run in Supabase SQL Editor (or directly against Aurora if needed).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS kibbe_type TEXT,
  ADD COLUMN IF NOT EXISTS kibbe_analysis JSONB,
  ADD COLUMN IF NOT EXISTS kibbe_source_photo TEXT;