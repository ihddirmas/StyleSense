-- Widen usage_events' action CHECK constraint to also allow the cap-hit
-- email dedupe-ledger markers written by usage_limits._notify_cap_hit
-- (cap_email_tryon, cap_email_event_scene, cap_email_animate). Without
-- this, hitting a real usage cap threw an unhandled 500 instead of the
-- intended 402, because record_usage_event() rejected those action values.
-- Already applied directly to the live Aurora cluster; this file documents
-- it so a fresh environment (staging rebuild, restore-from-snapshot) gets
-- the fix too. Idempotent via DROP IF EXISTS / re-ADD.
ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_action_check;
ALTER TABLE usage_events ADD CONSTRAINT usage_events_action_check
  CHECK (action IN (
    'event_scene', 'animate',
    'cap_email_tryon', 'cap_email_event_scene', 'cap_email_animate'
  ));
