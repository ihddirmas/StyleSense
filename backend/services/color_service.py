"""
Color profile analysis - Claude vision on the user's selfie.

Derives the user's skin undertone, seasonal color type, contrast level, and a
short list of flattering / avoid colors. Run once per selfie and cached on
users.color_profile (JSONB) so the Aria agent can reason about it cheaply on
every chat turn without re-analyzing the image.
"""
import base64
import json
import logging
import os
import re
from functools import lru_cache
from typing import Optional

import httpx

from services.anthropic_service import client, MODEL

logger = logging.getLogger(__name__)

_PALETTES_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "color_palettes.json")

@lru_cache(maxsize=1)
def _load_palettes() -> dict:
    try:
        with open(_PALETTES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Could not load color palettes: {e}")
        return {}

_UNDERTONE_SEASON_MAP = {
    "warm": ["spring", "autumn"],
    "cool": ["summer", "winter"],
    "neutral": ["spring", "summer", "autumn", "winter"]
}

COLOR_PROMPT = """Analyze the person in this photo for personal styling (seasonal color analysis).

STEP 1 — Observe traits BEFORE labeling (do not skip):
- Skin undertone cues (veins if visible, golden vs pink cast in natural light)
- Hair color and depth; eye color
- Overall contrast (hair vs skin vs eyes)
- Photo quality: lighting_quality "good" | "fair" | "poor" (warm lamps, heavy filters, backlit = poor)

STEP 2 — Reason step by step in reasoning_steps (2-4 short strings), then assign labels.

Reply with ONLY a JSON object (no prose, no markdown fences):
{
  "observed_traits": {
    "skin_undertone_cues": "brief",
    "hair": "brief",
    "eyes": "brief",
    "lighting_quality": "good" | "fair" | "poor"
  },
  "reasoning_steps": ["step 1", "step 2"],
  "undertone": "warm" | "cool" | "neutral",
  "season": "spring" | "summer" | "autumn" | "winter",
  "contrast": "low" | "medium" | "high",
  "flattering_colors": ["6-10 specific colors that suit them"],
  "avoid_colors": ["3-6 colors that wash them out or clash"],
  "body_type": "rectangle" | "hourglass" | "pear" | "inverted_triangle" | "apple" | "unknown",
  "face_shape": "oval" | "round" | "square" | "heart" | "oblong" | "diamond" | "unknown",
  "hair": "short phrase: length, color, texture",
  "photo_scope": "face" | "upper_body" | "full_body",
  "confidence": 0.0-1.0,
  "limitations": ["e.g. warm indoor lighting may skew undertone"],
  "notes": "one short sentence of styling guidance for their coloring"
}

Judge body_type ONLY if torso/full body is visible; else body_type "unknown" and photo_scope "face".
If lighting_quality is poor, lower confidence below 0.65. Return ONLY the JSON."""

VALID_UNDERTONE = {"warm", "cool", "neutral"}
VALID_SEASON = {"spring", "summer", "autumn", "winter"}
VALID_CONTRAST = {"low", "medium", "high"}
VALID_BODY = {"rectangle", "hourglass", "pear", "inverted_triangle", "apple", "unknown"}
VALID_FACE = {"oval", "round", "square", "heart", "oblong", "diamond", "unknown"}
VALID_SCOPE = {"face", "upper_body", "full_body"}


def _strip_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()


def _validate_coherence(undertone: str, season: str, contrast: str) -> tuple[str, str, bool]:
    """
    Check undertone-season consistency. Auto-correct if incoherent.
    Returns (corrected_season, corrected_contrast, was_corrected)
    """
    if not undertone or not season or undertone not in VALID_UNDERTONE or season not in VALID_SEASON:
        return season, contrast, False
    
    valid_seasons = _UNDERTONE_SEASON_MAP.get(undertone, [])
    if season in valid_seasons:
        return season, contrast, False
    
    palettes = _load_palettes()
    season_data = palettes.get("season_reference_swatches", {})
    
    if contrast == "high":
        corrected = "winter" if "winter" in valid_seasons else valid_seasons[0] if valid_seasons else season
    elif contrast == "low":
        if undertone == "warm":
            corrected = "spring" if "spring" in valid_seasons else "autumn"
        else:
            corrected = "summer" if "summer" in valid_seasons else "winter"
    else:
        corrected = valid_seasons[0] if valid_seasons else season
    
    corrected_contrast = season_data.get(corrected, {}).get("contrast", [contrast])[0] if corrected in season_data else contrast
    
    logger.info(f"Color validation: {undertone} + {season} -> corrected to {corrected} (contrast={corrected_contrast})")
    return corrected, corrected_contrast, True


def _normalize(data: dict) -> dict:
    undertone = str(data.get("undertone", "")).strip().lower()
    season = str(data.get("season", "")).strip().lower()
    contrast = str(data.get("contrast", "")).strip().lower()
    body = str(data.get("body_type", "")).strip().lower().replace(" ", "_").replace("-", "_")
    face = str(data.get("face_shape", "")).strip().lower()
    scope = str(data.get("photo_scope", "")).strip().lower().replace(" ", "_").replace("-", "_")
    
    undertone = undertone if undertone in VALID_UNDERTONE else "neutral"
    season = season if season in VALID_SEASON else ""
    contrast = contrast if contrast in VALID_CONTRAST else "medium"
    
    corrected_season, corrected_contrast, was_corrected = _validate_coherence(undertone, season, contrast)

    lighting = str((data.get("observed_traits") or {}).get("lighting_quality", "fair")).lower()
    if lighting not in ("good", "fair", "poor"):
        lighting = "fair"
    try:
        confidence = float(data.get("confidence", 0.75))
    except (TypeError, ValueError):
        confidence = 0.75
    confidence = max(0.0, min(1.0, confidence))
    if lighting == "poor":
        confidence = min(confidence, 0.6)
    elif lighting == "fair":
        confidence = min(confidence, 0.85)

    reasoning = [str(s).strip() for s in (data.get("reasoning_steps") or []) if str(s).strip()][:5]
    limitations = [str(s).strip() for s in (data.get("limitations") or []) if str(s).strip()][:4]
    observed = data.get("observed_traits") if isinstance(data.get("observed_traits"), dict) else {}

    return {
        "undertone": undertone,
        "season": corrected_season,
        "contrast": corrected_contrast,
        "flattering_colors": [str(c).strip() for c in (data.get("flattering_colors") or [])][:10],
        "avoid_colors": [str(c).strip() for c in (data.get("avoid_colors") or [])][:6],
        "body_type": body if body in VALID_BODY else "unknown",
        "face_shape": face if face in VALID_FACE else "unknown",
        "hair": str(data.get("hair", "")).strip()[:80],
        "photo_scope": scope if scope in VALID_SCOPE else "face",
        "notes": str(data.get("notes", "")).strip()[:300],
        "validation_corrected": was_corrected,
        "confidence": confidence,
        "lighting_quality": lighting,
        "reasoning_steps": reasoning,
        "limitations": limitations,
        "observed_traits": observed,
    }


def analyze_color_profile(selfie_url: str) -> Optional[dict]:
    """
    Download the selfie, run one Claude-vision call, and return a normalized
    color profile dict. Returns None on any failure (caller keeps whatever was
    cached, or proceeds without a profile).
    """
    try:
        with httpx.Client(timeout=20.0, follow_redirects=True) as c:
            r = c.get(selfie_url)
            r.raise_for_status()
        content_type = r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
        media_type = content_type if content_type in ("image/jpeg", "image/png", "image/webp", "image/gif") else "image/jpeg"

        resp = client.messages.create(
            model=MODEL,
            max_tokens=400,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type,
                                                  "data": base64.standard_b64encode(r.content).decode("ascii")}},
                    {"type": "text", "text": COLOR_PROMPT},
                ],
            }],
        )
        text = "".join(b.text for b in resp.content if hasattr(b, "text"))
        data = json.loads(_strip_json(text))
        return _normalize(data)
    except Exception as e:
        logger.warning(f"analyze_color_profile failed: {type(e).__name__}: {e}")
        return None


def _primary_selfie(user_row: dict) -> Optional[str]:
    return user_row.get("avatar_selfie_url") or (user_row.get("selfie_urls") or [None])[0]


def best_profile_source(user_row: dict) -> Optional[str]:
    """Pick the best photo to analyze: the full-body photo (covers color + body + hair)
    if present, else the primary face selfie. Used by every profile-analysis caller."""
    if not user_row:
        return None
    return user_row.get("full_body_url") or _primary_selfie(user_row)


def best_face_source(user_row: dict) -> Optional[str]:
    """Best photo for FACE/identity (try-on): the face selfie, else the full-body photo
    (which still contains a face). None if the user has uploaded neither."""
    if not user_row:
        return None
    return _primary_selfie(user_row) or user_row.get("full_body_url")


def get_season_swatches(season: Optional[str]) -> list[dict]:
    """Reference palette for a season: list of {"name", "hex"}. Empty if unknown."""
    if not season:
        return []
    return _load_palettes().get("season_reference_swatches", {}).get(season, {}).get("palette", [])


# Styling reference for YouCam's measured face-attr-analysis faceShape output
# (see youcam_service.youcam_face_shape_analysis) -- necklines, glasses, and
# earring shapes that balance each face shape. This is the reason that
# feature requests faceShape at all, per its own docstring; it was measured
# but never actually surfaced to a user until this reference existed.
FACE_SHAPE_STYLE_TIPS = {
    "oval": "Most necklines, glasses, and earring shapes suit you — few hard rules to work around.",
    "round": "Angular necklines (V-neck, square) and structured earrings add definition; avoid round frames.",
    "square": "Soften with round or oval necklines and curved earrings; avoid boxy, angular frames.",
    "heart": "Draw the eye down with V-necks and teardrop earrings; bottom-heavy frames balance a wider brow.",
    "diamond": "Cat-eye or rimless glasses and wide necklines flatter narrow cheekbone width best.",
    "triangle": "Statement necklines and top-heavy earrings balance a narrower forehead against a fuller jaw.",
    "invtriangle": "Rounded necklines and bottom-weighted earrings soften a wider forehead.",
    "oblong": "Rounded or curved necklines break up length; avoid long, narrow glasses frames.",
}

FACE_SHAPE_DISPLAY_LABELS = {
    "oval": "Oval",
    "round": "Round",
    "square": "Square",
    "heart": "Heart",
    "diamond": "Diamond",
    "triangle": "Triangle",
    "invtriangle": "Inverted Triangle",
    "oblong": "Oblong",
}


def get_face_shape_style_tip(face_shape: Optional[str]) -> Optional[str]:
    """Styling note for a measured face shape (see FACE_SHAPE_STYLE_TIPS). None if unknown."""
    if not face_shape:
        return None
    return FACE_SHAPE_STYLE_TIPS.get(face_shape.strip().lower().replace(" ", ""))


def get_face_shape_display(face_shape: Optional[str]) -> Optional[str]:
    """Human-readable label for a measured face shape. Falls back to title-case."""
    if not face_shape:
        return None
    key = face_shape.strip().lower().replace(" ", "")
    return FACE_SHAPE_DISPLAY_LABELS.get(key, face_shape.title())


# Each season's most-opposite season for avoid_colors, pairing across both
# undertone AND depth (spring=warm+light vs winter=cool+deep, etc.) --
# standard convention in seasonal color analysis.
_OPPOSITE_SEASON = {"spring": "winter", "winter": "spring", "summer": "autumn", "autumn": "summer"}


def classify_season_from_hex(skin_hex: Optional[str]) -> Optional[dict]:
    """
    Deterministic seasonal classification from a MEASURED skin-tone hex color
    (e.g. YouCam Skin AI's skin_color), as opposed to Claude vision's guess
    from a full photo. No LLM call -- pure color math, using the same
    season_reference_swatches data Claude-vision profiles already draw on,
    so results merge cleanly into an existing color_profile.

    Returns {"undertone", "season", "flattering_colors", "avoid_colors",
    "source": "youcam_measured"} or None if the hex is unparseable.
    """
    import colorsys

    if not skin_hex or not re.match(r"^#?[0-9a-fA-F]{6}$", skin_hex):
        return None

    h = skin_hex.lstrip("#")
    r, g, b = int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    hue, lightness, _sat = colorsys.rgb_to_hls(r, g, b)

    # Warm vs cool: classic red-minus-blue heuristic on skin tones -- warm
    # (golden/yellow) skin reads red-dominant over blue, cool (pink/rosy)
    # skin reads closer to neutral or blue-leaning.
    undertone = "warm" if (r - b) > 0.12 else "cool" if (r - b) < 0.04 else "neutral"

    # Light vs deep skin picks spring/summer (light) vs autumn/winter (deep)
    # within the undertone's two valid seasons -- an approximation (real
    # seasonal analysis also weighs contrast/clarity, not captured by a
    # single skin swatch), stated as such wherever this feeds Aria.
    valid = _UNDERTONE_SEASON_MAP.get(undertone, ["spring", "summer", "autumn", "winter"])
    if undertone == "warm":
        season = "spring" if lightness >= 0.55 else "autumn"
    elif undertone == "cool":
        season = "summer" if lightness >= 0.55 else "winter"
    else:
        season = min(valid, key=lambda s: abs(lightness - (0.65 if s in ("spring", "summer") else 0.4)))

    palette = get_season_swatches(season)
    avoid_palette = get_season_swatches(_OPPOSITE_SEASON.get(season, ""))

    return {
        "undertone": undertone,
        "season": season,
        "flattering_colors": [c["name"] for c in palette[:10]],
        "avoid_colors": [c["name"] for c in avoid_palette[:6]],
        "source": "youcam_measured",
    }


def best_body_source(user_row: dict) -> Optional[str]:
    """Best photo for BODY/proportions (avatar, optional try-on ref): the full-body photo,
    else the face selfie. None if neither exists."""
    if not user_row:
        return None
    return user_row.get("full_body_url") or _primary_selfie(user_row)


def format_color_profile(profile: Optional[dict]) -> str:
    """Render a profile into a compact line for an LLM system prompt."""
    if not profile:
        return "(no color profile yet)"
    flattering = ", ".join(profile.get("flattering_colors") or []) or "?"
    avoid = ", ".join(profile.get("avoid_colors") or []) or "?"
    body = profile.get("body_type") or "unknown"
    face = profile.get("face_shape") or "unknown"
    hair = profile.get("hair") or "?"
    conf = profile.get("confidence")
    conf_str = f" Confidence: {conf:.0%}." if isinstance(conf, (int, float)) else ""
    limits = profile.get("limitations") or []
    limit_str = f" Caveats: {'; '.join(limits)}." if limits else ""
    reasoning = profile.get("reasoning_steps") or []
    reason_str = f" Reasoning: {' → '.join(reasoning)}." if reasoning else ""
    lighting = profile.get("lighting_quality")
    light_str = f" Photo lighting: {lighting}." if lighting else ""
    return (
        f"Undertone: {profile.get('undertone', '?')}; "
        f"Season: {profile.get('season') or '?'}; "
        f"Contrast: {profile.get('contrast', '?')}.{conf_str}{light_str}{reason_str} "
        f"Flattering colors: {flattering}. Avoid: {avoid}. "
        f"Body type: {body}; Face shape: {face}; Hair: {hair}. "
        f"{profile.get('notes', '')}{limit_str}"
    ).strip()
