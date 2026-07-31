"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Catches errors thrown in the root layout itself (where error.tsx can't reach).
// Must render its own <html>/<body>. Kept dependency-free and inline-styled.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f1ea",
          color: "#1a1a1a",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#666", marginBottom: 20 }}>
            The app hit an unexpected error. Please try again.
          </p>
           <button
            onClick={reset}
            className="rounded-sm"
            style={{
              padding: "10px 20px",
              background: "#c9a84c",
              color: "#1a1a1a",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
