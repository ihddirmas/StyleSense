"""
Measure a garment's main color from its photo, stored as a `hex:#RRGGBB` tag.

Takes the largest color region rather than the average, because a red and white
stripe averages to a pink that isn't in the garment. Returns None for a busy print
with no main color, so callers keep labeling that item as an estimate.
"""
import io
import logging
import re
from collections import defaultdict
from statistics import median
from typing import Optional
from urllib.parse import urlparse

from PIL import Image, UnidentifiedImageError

logger = logging.getLogger(__name__)

HEX_TAG_PREFIX = "hex:"
MAX_ITEMS_PER_CALL = 20

_THUMBNAIL_SIZE = 96
_BUCKET_SIZE = 48  # wide enough that folds and shading stay in one region
_BACKGROUND_DISTANCE = 30
_MIN_REGION_SHARE = 0.2
_MIN_GARMENT_PIXELS = 50
_OPAQUE = 128


def _opaque_pixels(image: Image.Image) -> list[tuple[int, int, int]]:
    return [(r, g, b) for r, g, b, a in image.getdata() if a >= _OPAQUE]


def _without_background(image: Image.Image) -> list[tuple[int, int, int]]:
    """Drop pixels matching the photo's border, which is the studio or floor behind it."""
    width, height = image.size
    pixels = list(image.getdata())
    border = [
        pixels[y * width + x][:3]
        for y in range(height)
        for x in range(width)
        if x in (0, width - 1) or y in (0, height - 1)
    ]
    background = tuple(median(p[channel] for p in border) for channel in range(3))
    return [
        p[:3]
        for p in pixels
        if max(abs(p[channel] - background[channel]) for channel in range(3)) > _BACKGROUND_DISTANCE
    ]


def dominant_hex(image_bytes: bytes) -> Optional[str]:
    """Main color of a garment photo as #RRGGBB, or None if it has no clear main color."""
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    except (UnidentifiedImageError, OSError, ValueError) as e:
        logger.warning(f"Could not read garment image: {e}")
        return None
    image.thumbnail((_THUMBNAIL_SIZE, _THUMBNAIL_SIZE))

    has_transparency = image.getextrema()[3][0] < _OPAQUE
    pixels = _opaque_pixels(image) if has_transparency else _without_background(image)
    if len(pixels) < _MIN_GARMENT_PIXELS:
        return None

    regions: dict = defaultdict(list)
    for pixel in pixels:
        regions[tuple(channel // _BUCKET_SIZE for channel in pixel)].append(pixel)
    largest = max(regions.values(), key=len)
    if len(largest) / len(pixels) < _MIN_REGION_SHARE:
        return None

    mean = [sum(p[channel] for p in largest) // len(largest) for channel in range(3)]
    return "#{:02X}{:02X}{:02X}".format(*mean)


def is_fetchable(url: Optional[str], storage_base_url: Optional[str]) -> bool:
    """Only fetch from our own storage host, so stored URLs can't aim the server elsewhere."""
    if not url or not storage_base_url:
        return False
    target, storage = urlparse(url), urlparse(storage_base_url)
    return target.scheme == "https" and bool(target.hostname) and target.hostname == storage.hostname


def needs_measuring(item: dict) -> bool:
    return not any(str(t).lower().startswith(HEX_TAG_PREFIX) for t in (item.get("tags") or []))


def with_hex_tag(tags: Optional[list], hex_color: str) -> list:
    kept = [t for t in (tags or []) if not str(t).lower().startswith(HEX_TAG_PREFIX)]
    return [*kept, f"{HEX_TAG_PREFIX}{hex_color}"]


def measured_hex(item: dict) -> Optional[str]:
    """The hex stored by this service, or a literal hex in the color field."""
    for tag in item.get("tags") or []:
        text = str(tag).strip()
        if text.lower().startswith(HEX_TAG_PREFIX):
            value = text[len(HEX_TAG_PREFIX):]
            if re.fullmatch(r"#[0-9a-fA-F]{6}", value):
                return value
    color = (item.get("color") or "").strip()
    if re.fullmatch(r"#?[0-9a-fA-F]{6}", color):
        return "#" + color.lstrip("#")
    return None
