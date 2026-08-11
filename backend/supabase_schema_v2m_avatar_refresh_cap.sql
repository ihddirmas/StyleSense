-- Allow 'avatar_refresh' and 'wardrobe_clean' usage-cap tracking.
--
-- avatar_refresh: the "Refresh my avatar" button (Studio), which previously had
-- no rate limit or monthly cap at all.
-- See services/usage_limits.check_avatar_refresh_cap + routers/avatar.py's
-- /regenerate-stylized endpoint.
--
-- wardrobe_clean: Runway garment isolation/re-synthesis triggered by wardrobe
-- item adds (/upload, /from-url with clean on, /extract-from-image, /add-multi),
-- which previously had no rate limit or monthly cap at all despite spending real
-- Runway credits per call. See services/usage_limits.check_wardrobe_clean_cap.

ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_action_check;

ALTER TABLE usage_events ADD CONSTRAINT usage_events_action_check CHECK (action IN (
  'event_scene', 'animate', 'avatar_refresh', 'wardrobe_clean',
  'cap_email_tryon', 'cap_email_event_scene', 'cap_email_animate',
  'cap_email_avatar_refresh', 'cap_email_wardrobe_clean'
));
