import * as Sentry from "@sentry/nextjs";

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
