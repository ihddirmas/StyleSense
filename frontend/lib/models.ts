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
export const TRYON_MODELS: ModelOption[] = [
  // Hackathon primary engine (YouCam API Skin AI & Apparel VTO). Verified
  // end-to-end live 2026-08-09 (see docs/hackathons/YOUCAM_2026.md) — now
  // the default (see DEFAULT_TRYON_MODEL below).
  { id: "youcam", label: "YouCam VTO", blurb: "Purpose-built garment try-on", tier: "premium" },
  { id: "gen4_image", label: "Gen-4", blurb: "Best face match — looks most like you", tier: "premium" },
  { id: "gemini_2.5_flash", label: "Gemini 2.5 Flash", blurb: "Fast, reliable full-body", tier: "fast" },
  { id: "gen4_image_turbo", label: "Gen-4 Turbo", blurb: "Fast & cheap draft", tier: "fast" },
];

// Image-to-video models. veo3.1 is the default.
export const VIDEO_MODELS: ModelOption[] = [
  { id: "veo3.1", label: "Veo 3.1", blurb: "Realistic default motion", tier: "standard" },
  { id: "veo3.1_fast", label: "Veo 3.1 Fast", blurb: "Faster, lower cost", tier: "fast" },
  { id: "gen4_turbo", label: "Gen-4 Turbo", blurb: "Runway native motion", tier: "standard" },
];

export const DEFAULT_TRYON_MODEL = "youcam";
export const DEFAULT_VIDEO_MODEL = "veo3.1";
