-- =================================================================
-- v2n migration: YouCam skin-tone analysis results (Skin AI + Apparel
-- VTO hackathon track). Run in Supabase SQL Editor. Idempotent.
--
-- One skin-tone analysis per user, generated from their primary selfie
-- via YouCam's skin-tone-analysis API (skin/hair/eye/lip hex colors).
-- Feeds both a user-facing "Skin Report" card and Aria's system prompt,
-- so outfit/color advice can reference real detected tones alongside
-- the existing color-season profile (see services/youcam_service.py,
-- graphs/aria_graph.py).
-- =================================================================

-- Full result payload ({colors: {skin_color, hair_color, eye_color,
-- lip_color}}) kept as one JSONB blob rather than a column per field,
-- matching the color_profile / kibbe_analysis columns' existing shape.
ALTER TABLE users ADD COLUMN IF NOT EXISTS skin_analysis_result JSONB;

-- 'idle' | 'analyzing' | 'ready' | 'failed'
ALTER TABLE users ADD COLUMN IF NOT EXISTS skin_analysis_status TEXT DEFAULT 'idle';

-- Track which selfie the current analysis was made from, so we know to
-- re-run it when the primary selfie changes (mirrors stylized_avatar_source_selfie).
ALTER TABLE users ADD COLUMN IF NOT EXISTS skin_analysis_source_selfie TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS skin_analysis_updated_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
