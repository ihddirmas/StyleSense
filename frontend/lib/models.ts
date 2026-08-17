// Shared catalog of selectable Runway models for try-on (image) and video.
// Mirrored server-side by an allowlist in backend/services/runway_service.py.
// Verified against docs.dev.runwayml.com (June 2026).

export type ModelTier = "fast" | "standard" | "premium";

export interface ModelOption {
  id: string;
  label: string;
  blurb: string;
  tier: ModelTier;
}

// Try-on / image generation models. gen4_image is the default.
// Limited to models supported by the installed runwayml SDK (4.4.0). Newer
// models (gemini_image3_pro, gpt_image_2, seedance2) need an SDK upgrade.
// Labels below are user-facing outcome descriptions, deliberately hiding the
// underlying vendor/model name (e.g. "gen4_image", "Gemini 2.5 Flash") — a
// non-technical user shouldn't have to know which AI vendor renders their
// try-on, only what tradeoff they're picking.
export const TRYON_MODELS: ModelOption[] = [
  // Runway/Gemini give the more reliable photoreal outfit render; that's
  // the default and lead option. YouCam's cloth-v3 (hackathon Apparel VTO
  // engine, verified end-to-end 2026-08-09, see docs/hackathons/YOUCAM_2026.md)
  // stays available as the garment-specialized alternative, not the default.
  { id: "gen4_image", label: "Best Face Match", blurb: "Looks most like you", tier: "premium" },
  { id: "gemini_2.5_flash", label: "Fast Full-Body", blurb: "Fast, reliable full-body", tier: "fast" },
  { id: "youcam", label: "Best for Garments", blurb: "Purpose-built garment try-on", tier: "premium" },
  { id: "gen4_image_turbo", label: "Quick Draft", blurb: "Fast & cheap draft", tier: "fast" },
];

// Image-to-video models. veo3.1 is the default.
export const VIDEO_MODELS: ModelOption[] = [
  { id: "veo3.1", label: "Realistic Motion", blurb: "Realistic default motion", tier: "standard" },
  { id: "veo3.1_fast", label: "Faster Motion", blurb: "Faster, lower cost", tier: "fast" },
  { id: "gen4_turbo", label: "Native Motion", blurb: "Runway native motion", tier: "standard" },
];

export const DEFAULT_TRYON_MODEL = "gen4_image";
export const DEFAULT_VIDEO_MODEL = "veo3.1";
