"""
Kibbe body type analysis using Claude vision (Sonnet 4.6 for nuance).

Analyzes full-body photos to determine one of the 13 Kibbe body types based on
bone structure, flesh pattern, vertical line, and yin-yang balance. Results are
cached on users.kibbe_analysis (JSONB) and used by Aria for styling recommendations.
"""
import base64
import json
import logging
import os
import re
from functools import lru_cache
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

KIBBE_MODEL = "claude-sonnet-4-6"

_KB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "kibbe_knowledge.json")

@lru_cache(maxsize=1)
def _kb() -> dict:
    try:
        with open(_KB_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Could not load Kibbe knowledge base: {e}")
        return {}


VALID_TYPES = {
    "dramatic", "soft_dramatic", "flamboyant_natural", "natural", "soft_natural",
    "dramatic_classic", "classic", "soft_classic",
    "flamboyant_gamine", "gamine", "soft_gamine",
    "theatrical_romantic", "romantic"
}

VALID_YIN_YANG = {
    "pure yang", "yang with yin", "soft yang",
    "balanced", "balanced with yin", "balanced with yang",
    "yin with yang", "pure yin"
}

VALID_VERTICAL = {"long", "moderate", "short"}


def _strip_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()


def _normalize_type(raw: str) -> str:
    """Normalize Kibbe type name variants to canonical snake_case."""
    t = raw.strip().lower().replace(" ", "_").replace("-", "_")
    if t in VALID_TYPES:
        return t
    
    mapping = {
        "sd": "soft_dramatic", "softdramatic": "soft_dramatic",
        "fn": "flamboyant_natural", "flamboyantnatural": "flamboyant_natural",
        "n": "natural",
        "sn": "soft_natural", "softnatural": "soft_natural",
        "dc": "dramatic_classic", "dramaticclassic": "dramatic_classic",
        "c": "classic",
        "sc": "soft_classic", "softclassic": "soft_classic",
        "fg": "flamboyant_gamine", "flamboyantgamine": "flamboyant_gamine",
        "g": "gamine",
        "sg": "soft_gamine", "softgamine": "soft_gamine",
        "tr": "theatrical_romantic", "theatricalromantic": "theatrical_romantic",
        "r": "romantic",
    }
    return mapping.get(t, "natural")


def _validate_coherence(kibbe_type: str, yin_yang: str, vertical: str, bone: str, flesh: str) -> tuple[str, bool]:
    """
    Check if the determined Kibbe type matches the yin-yang + vertical + bone/flesh profile.
    Auto-correct if severely incoherent. Returns (corrected_type, was_corrected).
    """
    kb = _kb()
    types = kb.get("types", {})
    
    type_data = types.get(kibbe_type)
    if not type_data:
        return kibbe_type, False
    
    expected_yy = type_data.get("yin_yang", "")
    expected_v = type_data.get("vertical_line", "")
    
    yy_match = yin_yang == expected_yy or (yin_yang in expected_yy) or (expected_yy in yin_yang)
    v_match = vertical == expected_v
    
    if yy_match and v_match:
        return kibbe_type, False
    
    logger.info(f"Kibbe coherence issue: {kibbe_type} has yin_yang={expected_yy} vertical={expected_v}, but got {yin_yang}/{vertical}")
    
    for candidate, data in types.items():
        if data.get("yin_yang") == yin_yang and data.get("vertical_line") == vertical:
            logger.info(f"Auto-corrected {kibbe_type} -> {candidate} based on yin_yang + vertical match")
            return candidate, True
    
    if vertical == "long" and "yang" in yin_yang:
        return "dramatic", True
    elif vertical == "long" and "yin" in yin_yang:
        return "soft_dramatic", True
    elif vertical == "short" and "yang" in yin_yang:
        return "flamboyant_gamine", True
    elif vertical == "short" and "yin" in yin_yang:
        return "soft_gamine", True
    elif vertical == "moderate" and "balanced" in yin_yang:
        return "classic", True
    
    return kibbe_type, False


def analyze_kibbe_type(full_body_url: str) -> Optional[dict]:
    """
    Download full-body photo, run Claude Sonnet vision analysis for Kibbe typing.
    Returns normalized dict or None on failure.
    """
    try:
        from services.anthropic_service import client
        
        with httpx.Client(timeout=20.0, follow_redirects=True) as c:
            r = c.get(full_body_url)
            r.raise_for_status()
        
        content_type = r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
        media_type = content_type if content_type in ("image/jpeg", "image/png", "image/webp", "image/gif") else "image/jpeg"
        
        kb = _kb()
        prompt = kb.get("kibbe_prompt_template", "Analyze this photo for Kibbe body type. Return JSON.")
        
        resp = client.messages.create(
            model=KIBBE_MODEL,
            max_tokens=600,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type,
                                                  "data": base64.standard_b64encode(r.content).decode("ascii")}},
                    {"type": "text", "text": prompt},
                ],
            }],
        )
        
        text = "".join(b.text for b in resp.content if hasattr(b, "text"))
        data = json.loads(_strip_json(text))
        
        raw_type = str(data.get("kibbe_type", "")).strip()
        kibbe_type = _normalize_type(raw_type)
        
        yin_yang = str(data.get("yin_yang_balance", "")).strip().lower()
        if yin_yang not in VALID_YIN_YANG:
            yin_yang = "balanced"
        
        vertical = str(data.get("vertical_line", "")).strip().lower()
        if vertical not in VALID_VERTICAL:
            vertical = "moderate"
        
        bone = str(data.get("bone_structure", "")).strip()[:200]
        flesh = str(data.get("flesh", "")).strip()[:200]
        facial = str(data.get("facial_features", "")).strip()[:200]
        
        corrected_type, was_corrected = _validate_coherence(kibbe_type, yin_yang, vertical, bone, flesh)

        lighting = str(data.get("lighting_quality", "fair")).lower()
        if lighting not in ("good", "fair", "poor"):
            lighting = "fair"
        try:
            confidence = float(data.get("confidence", 0.7))
        except (TypeError, ValueError):
            confidence = 0.7
        confidence = max(0.0, min(1.0, confidence))
        if lighting == "poor":
            confidence = min(confidence, 0.55)

        reasoning = [str(s).strip() for s in (data.get("reasoning_steps") or []) if str(s).strip()][:5]
        limitations = [str(s).strip() for s in (data.get("limitations") or []) if str(s).strip()][:4]

        return {
            "kibbe_type": corrected_type,
            "yin_yang_balance": yin_yang,
            "vertical_line": vertical,
            "bone_structure": bone,
            "flesh": flesh,
            "facial_features": facial,
            "confidence": confidence,
            "lighting_quality": lighting,
            "reasoning_steps": reasoning,
            "limitations": limitations,
            "notes": str(data.get("notes", "")).strip()[:300],
            "validation_corrected": was_corrected,
        }
        
    except Exception as e:
        logger.warning(f"analyze_kibbe_type failed: {type(e).__name__}: {e}")
        return None


def get_type_reference(kibbe_type: Optional[str]) -> dict:
    """Static styling reference for a Kibbe type: style_essence, best_lines,
    best_fabrics, avoid. Empty dict if unknown."""
    if not kibbe_type:
        return {}
    return _kb().get("types", {}).get(kibbe_type, {})


def format_kibbe_profile(analysis: Optional[dict]) -> str:
    """Render Kibbe analysis into compact text for LLM system prompt."""
    if not analysis:
        return "(no Kibbe analysis yet)"
    
    kb = _kb()
    types = kb.get("types", {})
    kibbe_type = analysis.get("kibbe_type", "")
    
    type_display = kibbe_type.replace("_", " ").title()
    
    type_data = types.get(kibbe_type, {})
    essence = type_data.get("style_essence", "")
    best_lines = type_data.get("best_lines", "")
    best_fabrics = type_data.get("best_fabrics", "")
    avoid = type_data.get("avoid", "")
    
    conf = analysis.get("confidence")
    conf_str = f" Confidence: {conf:.0%}." if isinstance(conf, (int, float)) else ""
    limits = analysis.get("limitations") or []
    limit_str = f" Caveats: {'; '.join(limits)}." if limits else ""
    reasoning = analysis.get("reasoning_steps") or []
    reason_str = f" Reasoning: {' → '.join(reasoning)}." if reasoning else ""

    return (
        f"Kibbe Type: {type_display} ({analysis.get('yin_yang_balance', '?')}). "
        f"Vertical: {analysis.get('vertical_line', '?')}.{conf_str}{reason_str} "
        f"Bone: {analysis.get('bone_structure', '?')}. "
        f"Flesh: {analysis.get('flesh', '?')}. "
        f"Style essence: {essence}. "
        f"Best lines: {best_lines}. "
        f"Best fabrics: {best_fabrics}. "
        f"Avoid: {avoid}. "
        f"{analysis.get('notes', '')}{limit_str}"
    ).strip()
