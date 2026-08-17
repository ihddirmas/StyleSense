-- =================================================================
-- v2o migration: status tracking for the background color + Kibbe
-- analyses. Run in Supabase SQL Editor. Idempotent.
--
-- Both analyses run in FastAPI BackgroundTasks (routers/avatar.py
-- _bg_refresh_profile / _bg_refresh_kibbe) and swallowed every failure
-- into a logger.warning. With no status column the frontend could not
-- tell "still running" from "died 20 minutes ago", so /stylist/analysis
-- showed "hasn't finished yet — check back shortly" forever and the only
-- recovery was re-uploading a photo. Mirrors the skin_analysis_status
-- column added in v2n.
--
-- NOTE: the state vocabulary here is 'pending' | 'generating' | 'ready' |
-- 'failed'. skin_analysis_status (v2n) uses 'idle' | 'analyzing' for the
-- first two; these columns intentionally match the wording already used
-- by stylized_video_status ('generating') and read more naturally in the
-- UI. Everything downstream compares against these literals only.
-- =================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS color_analysis_status TEXT DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS kibbe_analysis_status TEXT DEFAULT 'pending';

-- Backfill: anyone who already has a completed analysis is 'ready', so
-- existing users don't get a spurious retry prompt on their next visit.
UPDATE users SET color_analysis_status = 'ready'
  WHERE color_profile IS NOT NULL AND color_analysis_status = 'pending';
UPDATE users SET kibbe_analysis_status = 'ready'
  WHERE kibbe_analysis IS NOT NULL AND kibbe_analysis_status = 'pending';

NOTIFY pgrst, 'reload schema';
