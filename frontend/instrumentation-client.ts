import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

// No-op until NEXT_PUBLIC_SENTRY_DSN is set (see frontend/.env.example).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "development",
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    // Session Replay is a Sentry.io-only feature (not implemented by GlitchTip's
    // ingestion API) — omitted so the SDK doesn't try to send unsupported payloads.
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

const phToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (phToken) {
  posthog.init(phToken, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  });
} else if (process.env.NODE_ENV !== "production") {
  console.error(
    "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, " +
    "this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured"
  );
}
