"""Product analytics (PostHog). No-op unless POSTHOG_API_KEY is set, same
pattern as sentry_sdk in main.py -- safe to call from anywhere without an
if-check at the call site."""
import os

from posthog import Posthog

POSTHOG_API_KEY = os.getenv("POSTHOG_API_KEY", "")

_client = (
    Posthog(POSTHOG_API_KEY, host=os.getenv("POSTHOG_HOST", "https://us.i.posthog.com"))
    if POSTHOG_API_KEY
    else None
)


def capture(user_id: str, event: str, properties: dict | None = None) -> None:
    if not _client:
        return
    _client.capture(distinct_id=user_id, event=event, properties=properties or {})
