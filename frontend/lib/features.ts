/**
 * MVP surface flags — cut list from 2026-08-02 brief.
 * Set NEXT_PUBLIC_MVP_MODE=false to re-enable spectacle/social features.
 *
 * HACKATHON: keep animate + B2/Genblaze visible for Backblaze Gen Media judges
 * (deadline Aug 3, 2026). Set NEXT_PUBLIC_HACKATHON_MODE=false after submission.
 */
export const MVP_MODE = process.env.NEXT_PUBLIC_MVP_MODE !== "false";
export const HACKATHON_MODE = process.env.NEXT_PUBLIC_HACKATHON_MODE !== "false";

export const FEATURES = {
  heroVideo: !MVP_MODE,
  eventScene: !MVP_MODE,
  /** Genblaze Runway→B2 pipeline — required for hackathon judging */
  animateVideo: HACKATHON_MODE || !MVP_MODE,
  social: !MVP_MODE,
  voiceAvatar: !MVP_MODE,
  stylizedAvatarOnUpload: !MVP_MODE,
  /** Show B2 / Genblaze provenance chips in Studio + try-on detail */
  mediaProvenance: HACKATHON_MODE || !MVP_MODE,
} as const;
