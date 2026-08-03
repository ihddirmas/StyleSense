/** Public PostHog project token — supports both env names used across deploy targets. */
export function getPostHogPublicKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_POSTHOG_KEY ||
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ||
    undefined
  );
}
