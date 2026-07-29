"""
Simple RAG-style retriever over the curated style knowledge base.

No vector DB - the knowledge file is small and structured, so we select the
relevant sections by (a) the user's color profile (season + undertone) and
(b) keyword overlap with the query/occasion. Returns short text snippets the
Aria agent injects into its prompt.
"""
import json
import logging
import os
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

_KB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "style_knowledge.json")
_KIBBE_KB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "kibbe_knowledge.json")


@lru_cache(maxsize=1)
def _kb() -> dict:
    try:
        with open(_KB_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Could not load style knowledge base: {e}")
        return {}

@lru_cache(maxsize=1)
def _kibbe_kb() -> dict:
    try:
        with open(_KIBBE_KB_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Could not load Kibbe knowledge base: {e}")
        return {}


def _format_kibbe_snippet(kibbe_type: str) -> Optional[str]:
    kb = _kibbe_kb()
    types = kb.get("types", {})
    t = kibbe_type.strip().lower().replace(" ", "_").replace("-", "_")
    type_data = types.get(t)
    if not type_data:
        return None
    display = t.replace("_", " ").title()
    essence = type_data.get("style_essence", "")
    best_lines = type_data.get("best_lines", "")
    best_fabrics = type_data.get("best_fabrics", "")
    best_silhouettes = type_data.get("best_silhouettes", "")
    avoid = type_data.get("avoid", "")
    return (
        f"[Kibbe: {display}] {essence}. "
        f"Best lines: {best_lines}. "
        f"Best fabrics: {best_fabrics}. "
        f"Best silhouettes: {best_silhouettes}. "
        f"Avoid: {avoid}."
    )


def _matches(section: dict, text: str) -> bool:
    kws = section.get("keywords") or []
    return any(kw.lower() in text for kw in kws)


def detect_occasion(text: str) -> Optional[str]:
    """Deterministic keyword match of an occasion name from free text. No LLM."""
    t = (text or "").lower()
    for name, block in _kb().get("occasions", {}).items():
        if name in t or _matches(block, t):
            return name
    return None


def retrieve(
    query: str = "",
    color_profile: Optional[dict] = None,
    occasion: Optional[str] = None,
    kibbe_type: Optional[str] = None,
    max_snippets: int = 6,
) -> list[str]:
    """
    Pull the relevant knowledge snippets:
      - the user's season + undertone blocks (from color_profile)
      - the occasion block matching `occasion` or keywords in the query
      - any pairing rules whose keywords appear in the query
    """
    kb = _kb()
    if not kb:
        return []

    text = f"{query} {occasion or ''}".lower()
    snippets: list[str] = []

    # Color profile blocks
    if color_profile:
        season = (color_profile.get("season") or "").strip().lower()
        undertone = (color_profile.get("undertone") or "").strip().lower()
        season_block = kb.get("seasons", {}).get(season)
        if season_block:
            snippets.append(season_block["text"])
        undertone_block = kb.get("undertones", {}).get(undertone)
        if undertone_block:
            snippets.append(undertone_block["text"])
        # Body-type block (research-grounded), with its citation appended.
        body = (color_profile.get("body_type") or "").strip().lower()
        body_block = kb.get("body_types", {}).get(body)
        if body_block:
            src = body_block.get("source")
            snippets.append(body_block["text"] + (f" [source: {src}]" if src else ""))

    # Kibbe type styling rules
    if kibbe_type:
        kibbe_snippet = _format_kibbe_snippet(kibbe_type)
        if kibbe_snippet:
            snippets.append(kibbe_snippet)

    # Occasion block: explicit match first, else keyword match against the query
    occasions = kb.get("occasions", {})
    occ_key = (occasion or "").strip().lower()
    if occ_key and occ_key in occasions:
        snippets.append(occasions[occ_key]["text"])
    else:
        for name, block in occasions.items():
            if (occ_key and occ_key in name) or _matches(block, text):
                snippets.append(block["text"])
                break

    # Pairing rules by keyword
    for rule in kb.get("pairing_rules", []):
        if _matches(rule, text):
            snippets.append(rule["text"])

    # De-dup, preserve order, cap
    seen, out = set(), []
    for s in snippets:
        if s not in seen:
            seen.add(s)
            out.append(s)
        if len(out) >= max_snippets:
            break
    return out
