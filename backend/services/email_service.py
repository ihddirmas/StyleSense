"""Transactional email (Resend). No-op unless RESEND_API_KEY is set, same
pattern as sentry_sdk / analytics_service -- safe to call from anywhere
without an if-check at the call site."""
import os
import logging

import resend

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("RESEND_FROM_EMAIL", "StyleSenseAI <onboarding@resend.dev>")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def send(to: str, subject: str, html: str) -> None:
    if not RESEND_API_KEY or not to:
        return
    try:
        resend.Emails.send({"from": FROM_EMAIL, "to": [to], "subject": subject, "html": html})
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Resend send failed: {e}")
