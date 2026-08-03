import { PostHog } from "posthog-node";

import { getPostHogPublicKey } from "./posthog-key";

export function getPostHogClient(): PostHog {
  const token = getPostHogPublicKey();
  if (!token) {
    if (process.env.NODE_ENV !== "production") {
      console.error(
        "PostHog project token is missing (set NEXT_PUBLIC_POSTHOG_KEY or NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN). " +
        "Events will be silently missed until configured."
      );
    }
  }
  return new PostHog(token || "", {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
}
