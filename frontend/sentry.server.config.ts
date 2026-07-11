import * as Sentry from "@sentry/nextjs";

// No-op until SENTRY_DSN is set (see frontend/.env.example).
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || "development",
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  });
}
