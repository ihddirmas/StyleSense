-- =================================================================
-- v2i migration: Add style_preferences column to users table in Aurora
-- Run this migration against the Aurora cluster to add missing column
-- =================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS style_preferences JSONB DEFAULT '[]'::jsonb;
