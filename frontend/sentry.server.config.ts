import * as Sentry from "@sentry/nextjs";

// No-op until SENTRY_DSN is set. DSN can point at Sentry.io or a self-hosted/
// hosted GlitchTip project — GlitchTip implements the same ingestion protocol,
// so the SDK doesn't need to know which one it's talking to.
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || "development",
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  });
}
