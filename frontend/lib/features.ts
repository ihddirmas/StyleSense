/**
 * MVP surface flags — cut list from 2026-08-02 brief.
 * Set NEXT_PUBLIC_MVP_MODE=false to re-enable spectacle/social features.
 *
 * HACKATHON_MODE originally kept animate + B2/Genblaze visible for Backblaze Gen
 * Media judging (deadline Aug 3, 2026). That window has passed, so it no longer
 * gates anything user-facing — only the internal provenance jargon (SHA-256
 * manifest hash, raw B2 URL) is tied to it, and that's off by default now.
 */
export const MVP_MODE = process.env.NEXT_PUBLIC_MVP_MODE !== "false";
export const HACKATHON_MODE = process.env.NEXT_PUBLIC_HACKATHON_MODE === "true";

export const FEATURES = {
  heroVideo: !MVP_MODE,
  eventScene: !MVP_MODE,
  /** Runway walk video — a real product feature, independent of hackathon judging */
  animateVideo: true,
  social: !MVP_MODE,
  voiceAvatar: !MVP_MODE,
  stylizedAvatarOnUpload: !MVP_MODE,
  /** Internal B2 / Genblaze provenance details (manifest hash, raw storage URL) — engineering-facing, not for end users */
  mediaProvenance: HACKATHON_MODE,
} as const;
