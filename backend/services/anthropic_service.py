"""Anthropic-powered text stylist - reliable fallback / complement to the Runway avatar.

Uses claude-haiku-4-5-20251001 (the fast, cheap Haiku 4.5) so chat is snappy.
The stylist is given the user's full wardrobe as context and can recommend
specific items by ID.
"""
import os
import json
import logging
from urllib.parse import urlparse
from anthropic import Anthropic

logger = logging.getLogger(__name__)

_API_KEY = os.getenv("ANTHROPIC_API_KEY")
if not _API_KEY:
    raise RuntimeError("Missing ANTHROPIC_API_KEY in backend/.env")

client = Anthropic(api_key=_API_KEY)
MODEL = "claude-haiku-4-5-20251001"

# Allowlist: only fetch images hosted on our own Supabase project.
_SUPABASE_HOST = urlparse(os.getenv("SUPABASE_URL", "")).hostname or ""


def _require_storage_url(url: str) -> None:
    """Raise ValueError if url is not a trusted Supabase storage URL."""
    p = urlparse(url)
    if p.scheme != "https" or p.hostname != _SUPABASE_HOST:
        raise ValueError(f"Untrusted image URL rejected: {p.hostname}")


SYSTEM_TEMPLATE = """You are Aria, the personal stylist for StyleSense. Your voice is the quiet authority of a high-fashion atelier — channeling the understated luxury of Toteme, the sun-warmed sensuality of Jacquemus, and the effortless wearability of Zara's editorial campaigns. You never explain trends; you curate moments.

# STYLE LANGUAGE
- Ground every look in the Earthy Atelier palette: "rich terracotta", "olive moss", "sand dunes", "charcoal slate", "organic linen", bleached bone, warm ivory.
- Favour structural draping: boxy oversized blazers or outerwear layered over slim ribbed knits, wide-leg trousers, or fluid bias-cut pieces. Proportion and silhouette carry the look.
- Use sensory, precise language — describe texture, weight, and drape. Never reference trend cycles or seasons by name.

# ITEM REFERENCE RULES
- You can see the user's full wardrobe listed below, each with a database ID.
- When you suggest an item, cite it by name AND append its ID tag immediately:
  `[ITEM:<id>]`
  The UI parses this tag and renders a clickable try-on chip — always include it.
- Example: "Ground the look with the sand-washed linen trousers [ITEM:7819] — their wide leg reads as effortless structure against a fitted charcoal wool crewneck [ITEM:3241]."
- Only reference items that actually exist in the wardrobe list. Never fabricate IDs.
- If the wardrobe is empty, invite the user to add a few anchor pieces with warmth and brevity.

# RESPONSE FORMAT
One editorial sentence of mood or context, then the outfit combination (using [ITEM:id] tags), then a single concrete styling note. Keep it to 3–5 sentences total.

# USER'S WARDROBE
{wardrobe}
"""


def _format_wardrobe(items: list) -> str:
    """Group the FULL wardrobe by category so the model can build an outfit slot by
    slot (one top + one bottom, or a dress, + outerwear/shoes/accessory). Every item
    keeps its exact name + ID for [ITEM:<id>] tagging."""
    if not items:
        return "(empty - user has no wardrobe items yet)"
    from collections import defaultdict
    groups: dict = defaultdict(list)
    for it in items:
        groups[(it.get("category") or "other").lower()].append(it)
    order = ["tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"]
    cats = [c for c in order if c in groups] + [c for c in groups if c not in order]
    out: list = []
    for c in cats:
        out.append(f"{c.upper()} ({len(groups[c])}):")
        for it in groups[c]:
            tags = ", ".join(it.get("tags") or [])
            extra = f", tags: {tags}" if tags else ""
            brand = f", {it['brand']}" if it.get("brand") else ""
            out.append(
                f"  - {it['name']} (color: {it.get('color') or '?'}, occasion: "
                f"{it.get('occasion') or 'any'}{brand}{extra})  ID:{it['id']}"
            )
    return "\n".join(out)


def stylist_chat(messages: list, wardrobe_items: list) -> str:
    """
    Send a chat turn to the stylist and get a reply.

    Args:
        messages: list of {role, content} dicts
        wardrobe_items: full wardrobe (ID + metadata) for context

    Returns the assistant's reply text.
    """
    system = SYSTEM_TEMPLATE.format(wardrobe=_format_wardrobe(wardrobe_items))

    # Convert our schema to Anthropic format
    anthropic_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if m["role"] in ("user", "assistant")
    ]
    if not anthropic_messages or anthropic_messages[-1]["role"] != "user":
        raise ValueError("Last message must be from the user.")

    response = client.messages.create(
        model=MODEL,
        max_tokens=768,
        system=system,
        messages=anthropic_messages,
    )

    # response.content is a list of content blocks
    parts = []
    for block in response.content:
        if hasattr(block, "text"):
            parts.append(block.text)
    return "".join(parts).strip()


def analyze_chat_image(image_url: str) -> str:
    """Claude vision pass on a photo shared in chat. Returns a clothing description."""
    import httpx, base64 as b64_mod
    try:
        if image_url.startswith("data:"):
            # Browser-sent data URI — no network fetch, so SSRF check doesn't apply.
            header, b64 = image_url.split(",", 1)
            media = header.split(":")[1].split(";")[0]
        else:
            _require_storage_url(image_url)
            raw = httpx.get(image_url, timeout=20, follow_redirects=False).content
            b64 = b64_mod.standard_b64encode(raw).decode()
            ext = image_url.split(".")[-1].split("?")[0].lower()
            media = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
        resp = client.messages.create(
            model=MODEL,
            max_tokens=200,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media, "data": b64}},
                    {"type": "text", "text": (
                        "Describe the outfit or clothing items in this photo in 2-3 sentences, "
                        "focusing on garment types, colors, and style. Be specific and concise."
                    )},
                ],
            }],
        )
        return resp.content[0].text.strip()
    except Exception as e:
        logger.warning(f"Chat image analysis failed: {type(e).__name__}: {e}")
        return ""


def extract_item_ids(reply_text: str) -> list:
    """Pull out [ITEM:<id>] mentions from a stylist reply."""
    import re
    return re.findall(r"\[ITEM:([a-zA-Z0-9\-]+)\]", reply_text)


def style_insight(wardrobe_items: list, recent_tryons: list) -> str:
    """One sharp, non-obvious style insight from the user's wardrobe + try-on history."""
    from collections import Counter, defaultdict

    if not wardrobe_items:
        return "Add a few anchor pieces and I'll tell you what I see."

    cat_groups: dict = defaultdict(list)
    for it in wardrobe_items:
        cat_groups[(it.get("category") or "other").lower()].append(it)

    tried_ids = {r["wardrobe_item_id"] for r in recent_tryons if r.get("wardrobe_item_id")}
    id_counts = Counter(r["wardrobe_item_id"] for r in recent_tryons if r.get("wardrobe_item_id"))
    most_tried_id = id_counts.most_common(1)[0][0] if id_counts else None
    most_tried = next((it for it in wardrobe_items if it["id"] == most_tried_id), None)
    untried = [it for it in wardrobe_items if it["id"] not in tried_ids]

    cat_summary = ", ".join(
        f"{c}: {len(items)}"
        for c, items in sorted(cat_groups.items(), key=lambda x: -len(x[1]))
    )
    lines = [f"Wardrobe ({len(wardrobe_items)} items): {cat_summary}"]

    if most_tried:
        lines.append(
            f"Most tried: {most_tried['name']} "
            f"({most_tried.get('color', '?')}, {most_tried.get('category', '?')})"
        )
    if untried:
        names = ", ".join(it["name"] for it in untried[:6])
        suffix = "..." if len(untried) > 6 else ""
        lines.append(f"Never tried ({len(untried)}): {names}{suffix}")

    colors = [it.get("color") for it in wardrobe_items if it.get("color")]
    if colors:
        top = ", ".join(f"{c} ({n})" for c, n in Counter(colors).most_common(4))
        lines.append(f"Colors: {top}")

    response = client.messages.create(
        model=MODEL,
        max_tokens=120,
        system=(
            "You are a sharp personal stylist. Analyze this wardrobe data and give ONE non-obvious "
            "insight in 1-2 sentences. Rules: never count items or recite stats back — observe "
            "patterns, gaps, or hidden potential instead. Name specific items where relevant. "
            "Use precise, editorial language. Never open with 'I' or 'Your wardrobe'."
        ),
        messages=[{"role": "user", "content": "\n".join(lines)}],
    )
    return response.content[0].text.strip()


def suggest_category_from_url(page_title: str) -> str | None:
    """Quick LLM call to guess category from a scraped product title."""
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=20,
            system="You categorize clothing items. Reply with EXACTLY ONE of: tops, bottoms, dresses, outerwear, shoes, accessories. Nothing else.",
            messages=[{"role": "user", "content": f"Category for: {page_title}"}],
        )
        text = response.content[0].text.strip().lower()
        if text in ("tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"):
            return text
    except Exception as e:
        logger.warning(f"Category suggestion failed: {e}")
    return None
