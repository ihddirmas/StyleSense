"""
"Should I wear this today?" -- a deterministic pre-flight check for an outfit,
run in the order a person actually decides:

  1. weather        -- is it warm/dry enough for these pieces?
  2. availability   -- is every piece clean, ironed, not lent out?
  3. color_on_you   -- does each color sit in MY season palette (CIEDE2000
                       against the swatches), and does it wash out or
                       overpower my MEASURED skin tone (YouCam skin_color)?
  4. color_together -- do the top and bottom work as a pair (neutral /
                       tonal / analogous / complementary vs. clashing hues)?
  5. shape          -- does each piece suit my body type / Kibbe line?
  6. occasion       -- is the neckline / hemline / color right for where I'm going?
  7. footwear       -- can I walk my commute in these shoes, in this weather?

Pure Python, no LLM/vision calls -- free to run on every Studio render and
inside Aria's tool loop. Every check reports "unknown" (never a guess) when
the data it needs is missing, and the overall confidence says how many checks
actually had data.
"""
import math
import re
from functools import lru_cache
from typing import Optional

from services import suitability_service


def _swatches(season: Optional[str]) -> list[dict]:
    # Lazy: color_service pulls in the Anthropic client at import time, and this
    # module is imported by aria_tools, which must stay importable without keys.
    from services import color_service

    return color_service.get_season_swatches(season)

PASS, WARN, FAIL, UNKNOWN = "pass", "warn", "fail", "unknown"
_RANK = {UNKNOWN: 0, PASS: 1, WARN: 2, FAIL: 3}

CHECK_LABELS = {
    "weather": "Weather",
    "availability": "Clean & ready",
    "color_on_you": "Color on you",
    "color_together": "Colors together",
    "shape": "Body shape",
    "occasion": "Occasion",
    "footwear": "Footwear & commute",
}

VALID_TRANSPORT = {"walk", "transit", "car", "bike", "cab"}
VALID_OCCASIONS = {
    "office", "office_party", "interview", "wedding_guest", "date", "party",
    "casual", "gym", "beach", "religious", "funeral", "travel",
}
_MODEST_OCCASIONS = {"office", "office_party", "interview", "religious", "funeral"}
_FORMAL_OCCASIONS = {"interview", "wedding_guest", "funeral"}

# ───────────────────────────── color math ───────────────────────────── #

# Common garment color words -> representative sRGB. Season swatch names
# from data/color_palettes.json are merged on top, so a wardrobe item named
# "rust" resolves to exactly the swatch it is being compared against.
_BASE_COLORS = {
    "black": "#111111", "white": "#FAFAFA", "off white": "#F2EFE6", "ivory": "#FFFFF0",
    "cream": "#F3E9D2", "beige": "#D9C7A7", "tan": "#C8A27A", "khaki": "#BDB07F",
    "camel": "#C19A6B", "brown": "#6B4226", "chocolate": "#4E2A1E", "grey": "#8E8E8E",
    "gray": "#8E8E8E", "charcoal": "#36454F", "navy": "#1F2A44", "blue": "#2F5DA8",
    "light blue": "#A9C8E8", "sky blue": "#87CEEB", "denim": "#3B5A80", "teal": "#1F7A7A",
    "green": "#3A7D44", "olive": "#708238", "sage": "#9CAF88", "mint": "#AAF0D1",
    "red": "#C0392B", "burgundy": "#6D1A2B", "maroon": "#6A1B2A", "wine": "#5E1A2A",
    "pink": "#F4A6C0", "hot pink": "#FF3E96", "blush": "#E8B4B8", "fuchsia": "#D1307A",
    "purple": "#6A3D9A", "lilac": "#C8A2C8", "yellow": "#F2D13A", "mustard": "#D4A017",
    "orange": "#E67E22", "coral": "#FF7F50", "peach": "#FFCBA4", "rust": "#B7410E",
    "gold": "#C9A227", "silver": "#BFC1C2",
}
_NEUTRAL_CHROMA = 15.0
# Colors styled as neutrals regardless of measured chroma (navy, camel, denim...).
_FASHION_NEUTRALS = ("black", "white", "off white", "ivory", "cream", "beige", "tan", "khaki", "camel",
                     "brown", "chocolate", "grey", "gray", "charcoal", "navy", "denim", "soft white",
                     "pure white", "true black", "cool grey")
# Seasons on the other side of the warm/cool split -- the ones a color can
# "belong to" instead of yours.
_CLASH_SEASONS = {
    "spring": ("summer", "winter"), "autumn": ("summer", "winter"),
    "summer": ("spring", "autumn"), "winter": ("spring", "autumn"),
}


def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def hex_to_lab(hex_color: str) -> tuple[float, float, float]:
    """sRGB hex -> CIE L*a*b* (D65)."""
    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (lin(c) for c in _hex_to_rgb(hex_color))
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116

    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def delta_e_2000(lab1: tuple, lab2: tuple) -> float:
    """CIEDE2000 color difference. ~2 = just noticeable, >10 = clearly different."""
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2
    c_bar = (math.hypot(a1, b1) + math.hypot(a2, b2)) / 2
    g = 0.5 * (1 - math.sqrt(c_bar ** 7 / (c_bar ** 7 + 25 ** 7)))
    a1p, a2p = a1 * (1 + g), a2 * (1 + g)
    c1p, c2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360
    h2p = math.degrees(math.atan2(b2, a2p)) % 360

    dLp = L2 - L1
    dCp = c2p - c1p
    if c1p * c2p == 0:
        dhp = 0.0
    elif abs(h2p - h1p) <= 180:
        dhp = h2p - h1p
    elif h2p - h1p > 180:
        dhp = h2p - h1p - 360
    else:
        dhp = h2p - h1p + 360
    dHp = 2 * math.sqrt(c1p * c2p) * math.sin(math.radians(dhp / 2))

    L_bar = (L1 + L2) / 2
    cp_bar = (c1p + c2p) / 2
    if c1p * c2p == 0:
        hp_bar = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hp_bar = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hp_bar = (h1p + h2p + 360) / 2
    else:
        hp_bar = (h1p + h2p - 360) / 2

    t = (1 - 0.17 * math.cos(math.radians(hp_bar - 30))
         + 0.24 * math.cos(math.radians(2 * hp_bar))
         + 0.32 * math.cos(math.radians(3 * hp_bar + 6))
         - 0.20 * math.cos(math.radians(4 * hp_bar - 63)))
    d_theta = 30 * math.exp(-(((hp_bar - 275) / 25) ** 2))
    rc = 2 * math.sqrt(cp_bar ** 7 / (cp_bar ** 7 + 25 ** 7))
    sl = 1 + 0.015 * (L_bar - 50) ** 2 / math.sqrt(20 + (L_bar - 50) ** 2)
    sc = 1 + 0.045 * cp_bar
    sh = 1 + 0.015 * cp_bar * t
    rt = -math.sin(math.radians(2 * d_theta)) * rc

    return math.sqrt(
        (dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh)
    )


def _chroma_hue(lab: tuple) -> tuple[float, float]:
    _, a, b = lab
    return math.hypot(a, b), math.degrees(math.atan2(b, a)) % 360


def _wheel_hue(hex_color: str) -> float:
    """Hue on the stylist's color wheel (HSV degrees). CIELab hue angles are
    perceptual, not the wheel complementary/analogous rules are defined on --
    in Lab, blue vs orange is only ~140 deg apart."""
    import colorsys

    return colorsys.rgb_to_hsv(*_hex_to_rgb(hex_color))[0] * 360


def _is_neutral(color_text: Optional[str], lab: tuple) -> bool:
    text = (color_text or "").lower()
    return _chroma_hue(lab)[0] < _NEUTRAL_CHROMA or bool(_has_any(text, _FASHION_NEUTRALS))


@lru_cache(maxsize=1)
def _color_table() -> dict[str, str]:
    table = dict(_BASE_COLORS)
    for season in ("spring", "summer", "autumn", "winter"):
        for swatch in _swatches(season):
            if swatch.get("name") and swatch.get("hex"):
                table[swatch["name"].lower()] = swatch["hex"]
    return table


def resolve_hex(color: Optional[str]) -> Optional[str]:
    """Item color text -> hex. Accepts a literal hex, an exact name, or the
    longest known color phrase inside free text ("dark navy cotton" -> navy)."""
    if not color or not color.strip():
        return None
    text = color.strip().lower()
    if re.fullmatch(r"#?[0-9a-f]{6}", text):
        return "#" + text.lstrip("#")
    table = _color_table()
    if text in table:
        return table[text]
    hits = [name for name in table if re.search(rf"\b{re.escape(name)}\b", text)]
    return table[max(hits, key=len)] if hits else None


def _nearest_swatch(lab: tuple, season: str) -> Optional[tuple[str, float]]:
    best = None
    for swatch in _swatches(season):
        if not swatch.get("hex"):
            continue
        d = delta_e_2000(lab, hex_to_lab(swatch["hex"]))
        if best is None or d < best[1]:
            best = (swatch["name"], d)
    return best


# ───────────────────────────── helpers ───────────────────────────── #

def _text(item: dict) -> str:
    return f"{item.get('name') or ''} {' '.join(item.get('tags') or [])}".lower()


def _has_any(text: str, phrases) -> Optional[str]:
    for phrase in phrases:
        if re.search(rf"\b{re.escape(phrase)}(e?s)?\b", text):
            return phrase
    return None


def _finding(status: str, reason: str, item: Optional[dict] = None) -> dict:
    return {"status": status, "reason": reason, "item_id": (item or {}).get("id")}


def _rollup(key: str, findings: list[dict], unknown_reason: str) -> dict:
    if not findings:
        findings = [_finding(UNKNOWN, unknown_reason)]
    status = max((f["status"] for f in findings), key=_RANK.__getitem__)
    return {"check": key, "label": CHECK_LABELS[key], "status": status, "findings": findings}


def _by_category(items: list[dict], *cats: str) -> list[dict]:
    return [it for it in items if (it.get("category") or "").lower() in cats]


# ───────────────────────────── the checks ───────────────────────────── #

_WARM_FABRICS = ("wool", "knit", "sweater", "fleece", "turtleneck", "cashmere", "leather", "puffer", "corduroy")
_COLD_EXPOSED = ("shorts", "sleeveless", "tank", "sandal", "slide", "flip flop", "flip-flop", "mini", "crop", "cropped")
_RAIN_FRAGILE = ("suede", "silk", "satin", "canvas", "sandal", "espadrille", "open toe", "open-toe")


def _check_weather(items: list[dict], temp_c: Optional[float], raining: Optional[bool]) -> dict:
    if temp_c is None and raining is None:
        return _rollup("weather", [], "No weather given -- tell me the temperature or share your location.")
    findings = []
    has_outer = bool(_by_category(items, "outerwear"))
    if temp_c is not None:
        if temp_c < 12 and not has_outer:
            findings.append(_finding(WARN, f"{temp_c:.0f}C with no outer layer -- add a jacket or coat."))
        for it in items:
            t = _text(it)
            if temp_c >= 27 and (hit := _has_any(t, _WARM_FABRICS)):
                findings.append(_finding(WARN, f"{it.get('name')} ({hit}) will be heavy at {temp_c:.0f}C.", it))
            if temp_c < 12 and (hit := _has_any(t, _COLD_EXPOSED)):
                findings.append(_finding(WARN, f"{it.get('name')} ({hit}) is exposed for {temp_c:.0f}C.", it))
    if raining:
        if not has_outer:
            findings.append(_finding(WARN, "Rain forecast and no outer layer -- bring a rain jacket or umbrella."))
        for it in items:
            if hit := _has_any(_text(it), _RAIN_FRAGILE):
                findings.append(_finding(WARN, f"{it.get('name')} ({hit}) doesn't like rain.", it))
    if not findings:
        bits = [f"{temp_c:.0f}C" if temp_c is not None else None, "rain" if raining else ("dry" if raining is False else None)]
        findings.append(_finding(PASS, f"Dressed right for {', '.join(b for b in bits if b)}."))
    return _rollup("weather", findings, "")


_STATUS_RULES = {
    "laundry": (FAIL, "is in the laundry"),
    "stain": (FAIL, "has a stain to treat first"),
    "lent": (FAIL, "is lent out"),
    "repair": (FAIL, "needs a repair"),
    "needs_iron": (WARN, "needs ironing (~10 min)"),
}


def item_status(item: dict) -> Optional[str]:
    """Availability status from item['status'] or a 'status:<x>' tag."""
    status = item.get("status")
    if not status:
        for tag in item.get("tags") or []:
            if isinstance(tag, str) and tag.lower().startswith("status:"):
                status = tag.split(":", 1)[1]
                break
    status = (status or "").strip().lower().replace(" ", "_").replace("-", "_")
    return status if status in _STATUS_RULES else None


def is_wearable(item: dict) -> bool:
    """False when the item can't be worn today (laundry, stain, lent, repair).
    Needs-ironing still counts as wearable -- it's a warning, not a blocker."""
    status = item_status(item)
    return not status or _STATUS_RULES[status][0] != FAIL


def _check_availability(items: list[dict]) -> dict:
    findings = []
    for it in items:
        status = item_status(it)
        if status:
            level, phrase = _STATUS_RULES[status]
            findings.append(_finding(level, f"{it.get('name')} {phrase}.", it))
    if not findings:
        findings.append(_finding(PASS, "Every piece is clean and ready."))
    return _rollup("availability", findings, "")


_NEAR_FACE = {"tops", "dresses", "outerwear"}


def _check_color_on_you(items: list[dict], color_profile: Optional[dict], skin_hex: Optional[str]) -> tuple[dict, bool]:
    season = (color_profile or {}).get("season")
    contrast = (color_profile or {}).get("contrast")
    skin_lab = hex_to_lab(skin_hex) if skin_hex and re.fullmatch(r"#?[0-9a-fA-F]{6}", skin_hex) else None
    findings = []
    measured = False

    for it in items:
        if (it.get("category") or "").lower() in ("shoes", "accessories"):
            continue
        hex_color = resolve_hex(it.get("color"))
        if not hex_color:
            if color_profile:
                v = suitability_service.get_color_verdict(it.get("color"), color_profile)
                level = {"flatters": PASS, "reconsider": WARN}.get(v["verdict"], UNKNOWN)
                findings.append(_finding(level, v["reason"], it))
            continue
        lab = hex_to_lab(hex_color)
        name = it.get("name")

        if season:
            own = _nearest_swatch(lab, season)
            clashes = [(s, m) for s in _CLASH_SEASONS.get(season, ()) if (m := _nearest_swatch(lab, s))]
            clash = min(clashes, key=lambda c: c[1][1]) if clashes else None
            if own and own[1] <= 12:
                findings.append(_finding(PASS, f"{name} sits in your {season} palette (dE {own[1]:.1f} from {own[0]}).", it))
            elif own and clash and clash[1][1] <= 12 and clash[1][1] + 4 < own[1]:
                other, (swatch, d) = clash
                near_face = (it.get("category") or "").lower() in _NEAR_FACE
                findings.append(_finding(
                    FAIL if near_face else WARN,
                    f"{name} reads {other} (dE {d:.1f} from {swatch}) vs dE {own[1]:.1f} to your nearest "
                    f"{season} swatch {own[0]}" + (" -- worn near the face, that's where it shows." if near_face else "."),
                    it,
                ))
            elif own:
                findings.append(_finding(PASS, f"{name} is off-palette but not opposing (nearest {season}: {own[0]}, dE {own[1]:.1f}).", it))

        if skin_lab and (it.get("category") or "").lower() in _NEAR_FACE:
            measured = True
            d_skin = delta_e_2000(lab, skin_lab)
            d_light = abs(lab[0] - skin_lab[0])
            if d_skin < 10:
                findings.append(_finding(WARN, f"{name} is only dE {d_skin:.1f} from your measured skin tone -- may wash you out near the face.", it))
            elif contrast == "low" and d_light > 65:
                findings.append(_finding(WARN, f"{name} is {d_light:.0f} L* from your skin; with low natural contrast it may overpower you.", it))

    return _rollup("color_on_you", findings, "No color analysis yet -- run Skin AI or color analysis first."), measured


def _check_color_together(items: list[dict]) -> dict:
    tops = _by_category(items, "tops", "dresses")
    bottoms = _by_category(items, "bottoms")
    if not tops or not bottoms:
        return _rollup("color_together", [], "Needs a top and a bottom to judge the pairing.")
    findings = []
    for top in tops:
        for bottom in bottoms:
            th, bh = resolve_hex(top.get("color")), resolve_hex(bottom.get("color"))
            if not th or not bh:
                continue
            tl, bl = hex_to_lab(th), hex_to_lab(bh)
            pair = f"{top.get('color')} + {bottom.get('color')}"
            d = delta_e_2000(tl, bl)
            if 3 < d < 10:
                findings.append(_finding(WARN, f"{pair}: dE {d:.1f} -- close but not matching, reads as a missed match. Go tonal or contrast."))
                continue
            if _is_neutral(top.get("color"), tl) or _is_neutral(bottom.get("color"), bl):
                findings.append(_finding(PASS, f"{pair}: a neutral anchors the pair."))
                continue
            gap = abs(_wheel_hue(th) - _wheel_hue(bh))
            gap = min(gap, 360 - gap)
            if gap <= 60:
                findings.append(_finding(PASS, f"{pair}: analogous hues ({gap:.0f} deg apart on the wheel)."))
            elif 140 <= gap:
                findings.append(_finding(PASS, f"{pair}: complementary ({gap:.0f} deg) -- bold, intentional contrast."))
            elif 100 <= gap < 140:
                findings.append(_finding(PASS, f"{pair}: triadic ({gap:.0f} deg) -- playful but balanced."))
            else:
                findings.append(_finding(WARN, f"{pair}: hues {gap:.0f} deg apart, neither harmonious nor complementary -- they may fight."))
    return _rollup("color_together", findings, "Couldn't read the colors of the top and bottom.")


# Classic body-type balancing guidance -- favor = draws the eye where it balances
# the frame, avoid = adds volume where the frame already has it.
BODY_TYPE_RULES = {
    "inverted_triangle": {
        "favor": ("a-line", "wide-leg", "wide leg", "flare", "flared", "palazzo", "bootcut", "full skirt", "pleated", "v-neck", "raglan"),
        "avoid": ("puff sleeve", "shoulder pad", "boat neck", "off-shoulder", "off the shoulder", "halter", "epaulette", "skinny", "pencil skirt"),
        "why": "balance broader shoulders with volume at the hip",
    },
    "pear": {
        "favor": ("boat neck", "off-shoulder", "puff sleeve", "structured shoulder", "a-line", "bootcut", "wide-leg"),
        "avoid": ("skinny", "pencil skirt", "cargo", "bodycon", "hip pocket"),
        "why": "draw the eye up and skim the hip",
    },
    "hourglass": {
        "favor": ("wrap", "belted", "fitted", "pencil", "high-waist", "high waist"),
        "avoid": ("boxy", "oversized", "shapeless", "drop waist", "shift"),
        "why": "follow the defined waist",
    },
    "rectangle": {
        "favor": ("peplum", "belted", "ruffle", "ruffled", "wrap", "layered", "a-line"),
        "avoid": ("boxy", "shift"),
        "why": "create waist definition",
    },
    "apple": {
        "favor": ("empire", "v-neck", "a-line", "wrap", "straight-leg", "straight leg"),
        "avoid": ("crop", "cropped", "bodycon", "clingy", "belted"),
        "why": "lengthen the torso and skim the midsection",
    },
}


def _check_shape(items: list[dict], body_type: Optional[str], kibbe_ref: Optional[dict]) -> dict:
    rules = BODY_TYPE_RULES.get((body_type or "").lower())
    findings = []
    for it in items:
        if (it.get("category") or "").lower() in ("shoes", "accessories"):
            continue
        text = _text(it)
        if rules:
            label = body_type.replace("_", " ")
            if hit := _has_any(text, rules["avoid"]):
                findings.append(_finding(WARN, f"{it.get('name')}: {hit} works against a {label} frame -- aim to {rules['why']}.", it))
            elif hit := _has_any(text, rules["favor"]):
                findings.append(_finding(PASS, f"{it.get('name')}: {hit} helps a {label} frame {rules['why']}.", it))
        if kibbe_ref:
            v = suitability_service.get_silhouette_verdict(it, kibbe_ref)
            if v["verdict"] != "neutral":
                findings.append(_finding(PASS if v["verdict"] == "flatters" else WARN, v["reason"], it))
    if not findings and (rules or kibbe_ref):
        findings.append(_finding(PASS, "Nothing here fights your body type."))
    return _rollup("shape", findings, "No body-type analysis yet -- add a full-body photo.")


_REVEALING_HARD = ("deep v", "deep-v", "plunge", "plunging", "low-cut", "low cut", "backless", "sheer",
                   "see-through", "bralette", "strapless", "cut-out", "cutout", "corset")
_REVEALING_SOFT = ("mini", "crop", "cropped", "bodycon", "slip dress", "micro")
_CASUAL_SHOES = ("sneaker", "trainer", "flip flop", "flip-flop", "slide", "croc")


def _check_occasion(items: list[dict], occasion: Optional[str]) -> dict:
    if not occasion:
        return _rollup("occasion", [], "Where are you going? Tell me the occasion.")
    label = occasion.replace("_", " ")
    findings = []
    for it in items:
        text = _text(it)
        if occasion in _MODEST_OCCASIONS:
            if hit := _has_any(text, _REVEALING_HARD):
                findings.append(_finding(FAIL, f"{it.get('name')}: {hit} is too revealing for {label}.", it))
            elif hit := _has_any(text, _REVEALING_SOFT):
                findings.append(_finding(WARN, f"{it.get('name')}: {hit} is borderline for {label}.", it))
        if occasion in _FORMAL_OCCASIONS and (hit := _has_any(text, _CASUAL_SHOES)):
            findings.append(_finding(WARN, f"{it.get('name')}: {hit} reads too casual for {label}.", it))
        if occasion == "wedding_guest" and (it.get("category") or "").lower() in ("dresses", "tops", "outerwear"):
            hex_color = resolve_hex(it.get("color"))
            if hex_color and hex_to_lab(hex_color)[0] > 92 and _chroma_hue(hex_to_lab(hex_color))[0] < 10:
                findings.append(_finding(FAIL, f"{it.get('name')} is white/ivory -- leave that to the bride.", it))
        if occasion == "funeral" and (it.get("category") or "").lower() not in ("shoes", "accessories"):
            hex_color = resolve_hex(it.get("color"))
            if hex_color and _chroma_hue(hex_to_lab(hex_color))[0] > 45:
                findings.append(_finding(WARN, f"{it.get('name')} ({it.get('color')}) is bright for a funeral.", it))
    if not findings:
        findings.append(_finding(PASS, f"Appropriate for {label}."))
    return _rollup("occasion", findings, "")


_HEELS = ("stiletto", "heel", "pump", "platform", "wedge")
_LONG_HEMS = ("maxi", "wide-leg", "wide leg", "palazzo", "flared")


def _check_footwear(items: list[dict], walk_minutes: Optional[int], transport: Optional[str],
                    raining: Optional[bool]) -> dict:
    shoes = _by_category(items, "shoes")
    if walk_minutes is None and not transport:
        return _rollup("footwear", [], "How are you getting there, and how much walking?")
    findings = []
    walking = walk_minutes or 0
    if transport in ("walk", "transit") and walk_minutes is None:
        walking = 15
    if not shoes:
        findings.append(_finding(UNKNOWN, "No shoes picked yet."))
    for shoe in shoes:
        text = _text(shoe)
        hit = _has_any(text, _HEELS)
        if hit and "block" not in text and walking >= 20:
            findings.append(_finding(FAIL, f"{shoe.get('name')}: ~{walking} min on foot in {hit}s -- switch to flats or carry them.", shoe))
        elif hit and walking >= 10:
            findings.append(_finding(WARN, f"{shoe.get('name')}: ~{walking} min of walking in {hit}s -- a block heel or flat is safer.", shoe))
        elif raining and (rhit := _has_any(text, ("suede", "canvas", "sandal", "open toe", "open-toe"))):
            findings.append(_finding(WARN, f"{shoe.get('name')} ({rhit}) in the rain.", shoe))
        else:
            findings.append(_finding(PASS, f"{shoe.get('name')} handles ~{walking} min on foot.", shoe))
    if transport == "bike":
        for it in items:
            if hit := _has_any(_text(it), _LONG_HEMS + ("mini", "pencil skirt")):
                findings.append(_finding(WARN, f"{it.get('name')} ({hit}) is awkward on a bike.", it))
    return _rollup("footwear", findings, "")


# ───────────────────────────── entry point ───────────────────────────── #

def check_outfit(
    items: list[dict],
    *,
    color_profile: Optional[dict] = None,
    kibbe_ref: Optional[dict] = None,
    skin_analysis: Optional[dict] = None,
    occasion: Optional[str] = None,
    temp_c: Optional[float] = None,
    raining: Optional[bool] = None,
    walk_minutes: Optional[int] = None,
    transport: Optional[str] = None,
) -> dict:
    """
    Run every check on a set of wardrobe items and return
    {"verdict": "wear" | "tweak" | "skip", "headline", "checks": [...],
     "confidence": 0-1, "unknowns": [labels], "measured_skin": bool}.

    skin_analysis is the stored YouCam skin-tone result ({"colors": {"skin_color": hex}});
    when present, near-face colors are graded against the MEASURED skin hex.
    """
    skin_hex = ((skin_analysis or {}).get("colors") or {}).get("skin_color")
    occasion = occasion if occasion in VALID_OCCASIONS else None
    transport = transport if transport in VALID_TRANSPORT else None

    color_check, measured = _check_color_on_you(items, color_profile, skin_hex)
    checks = [
        _check_weather(items, temp_c, raining),
        _check_availability(items),
        color_check,
        _check_color_together(items),
        _check_shape(items, (color_profile or {}).get("body_type"), kibbe_ref),
        _check_occasion(items, occasion),
        _check_footwear(items, walk_minutes, transport, raining),
    ]

    statuses = [c["status"] for c in checks]
    if FAIL in statuses:
        verdict = "skip"
    elif WARN in statuses:
        verdict = "tweak"
    else:
        verdict = "wear"

    blocking = [f["reason"] for c in checks for f in c["findings"] if f["status"] == FAIL]
    warnings = [f["reason"] for c in checks for f in c["findings"] if f["status"] == WARN]
    if blocking:
        headline = blocking[0]
    elif warnings:
        headline = warnings[0]
    else:
        headline = "Good to go."

    unknowns = [c["label"] for c in checks if c["status"] == UNKNOWN]
    return {
        "verdict": verdict,
        "headline": headline,
        "checks": checks,
        "confidence": round((len(checks) - len(unknowns)) / len(checks), 2),
        "unknowns": unknowns,
        "measured_skin": measured,
    }
