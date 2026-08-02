-- B2 cold archive + Genblaze provenance on generated try-ons.
-- Supabase Storage remains the hot CDN for images; B2 holds durable archive + manifests.

ALTER TABLE try_on_results ADD COLUMN IF NOT EXISTS b2_image_url TEXT;
ALTER TABLE try_on_results ADD COLUMN IF NOT EXISTS image_manifest_hash TEXT;
ALTER TABLE try_on_results ADD COLUMN IF NOT EXISTS b2_video_url TEXT;
ALTER TABLE try_on_results ADD COLUMN IF NOT EXISTS video_manifest_hash TEXT;
