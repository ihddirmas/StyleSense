import { H } from "@highlight-run/next/client";

const projectId = process.env.NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID;

if (projectId) {
  H.init(projectId, {
    environment: process.env.NEXT_PUBLIC_HIGHLIGHT_ENVIRONMENT || "development",
    tracingOrigins: true,
    networkRecording: { enabled: true, recordHeadersAndBody: false },
  });
}
