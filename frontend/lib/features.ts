/**
 * MVP surface flags — cut list from 2026-08-02 brief.
 * Set NEXT_PUBLIC_MVP_MODE=false to re-enable spectacle/social features.
 */
export const MVP_MODE = process.env.NEXT_PUBLIC_MVP_MODE !== "false";

export const FEATURES = {
  heroVideo: !MVP_MODE,
  eventScene: !MVP_MODE,
  animateVideo: !MVP_MODE,
  social: !MVP_MODE,
  voiceAvatar: !MVP_MODE,
  stylizedAvatarOnUpload: !MVP_MODE,
} as const;
