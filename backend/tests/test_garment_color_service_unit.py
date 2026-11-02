"""
Unit tests for garment_color_service: measuring a garment's color from its photo.

No network: images are generated in memory and the fetch is faked.
Run with: .\\venv\\Scripts\\python.exe -m pytest tests/test_garment_color_service_unit.py -v
"""
import io
import os
import random
import sys
from pathlib import Path

from PIL import Image

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import garment_color_service as gc
from services import look_check_service as look_check

RUST = (183, 65, 14)
STORAGE = "https://abc.supabase.co"


def _png(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, "PNG")
    return buf.getvalue()


def _garment_on_background(color, background=(245, 245, 245), mode="RGB") -> bytes:
    image = Image.new(mode, (200, 200), background)
    image.paste(Image.new(mode, (120, 120), color), (40, 40))
    return _png(image)


def _close_to(hex_color: str, rgb: tuple) -> bool:
    h = hex_color.lstrip("#")
    return all(abs(int(h[i * 2:i * 2 + 2], 16) - rgb[i]) < 16 for i in range(3))


def test_measures_the_garment_not_the_studio_background():
    assert _close_to(gc.dominant_hex(_garment_on_background(RUST)), RUST)


def test_uses_only_opaque_pixels_of_a_transparent_cutout():
    data = _garment_on_background((*RUST, 255), background=(0, 0, 0, 0), mode="RGBA")

    assert _close_to(gc.dominant_hex(data), RUST)


def test_black_garment_on_white_is_measured_as_black():
    assert _close_to(gc.dominant_hex(_garment_on_background((20, 20, 20))), (20, 20, 20))


def test_stripes_return_a_real_stripe_color_not_their_average():
    image = Image.new("RGB", (200, 200), (245, 245, 245))
    for x in range(40, 160):
        for y in range(40, 160):
            image.putpixel((x, y), (200, 30, 30) if (y // 16) % 2 else (30, 30, 200))

    hex_color = gc.dominant_hex(_png(image))

    assert _close_to(hex_color, (200, 30, 30)) or _close_to(hex_color, (30, 30, 200))


def test_busy_print_with_no_main_color_stays_unmeasured():
    rng = random.Random(1)
    image = Image.new("RGB", (200, 200), (245, 245, 245))
    for x in range(40, 160):
        for y in range(40, 160):
            image.putpixel((x, y), (rng.randrange(256), rng.randrange(256), rng.randrange(256)))

    assert gc.dominant_hex(_png(image)) is None


def test_unreadable_image_returns_none():
    assert gc.dominant_hex(b"not an image") is None


def test_only_our_own_storage_host_is_fetched():
    assert gc.is_fetchable(f"{STORAGE}/storage/v1/object/public/wardrobe/a.jpg", STORAGE)
    assert not gc.is_fetchable("https://retailer.example/a.jpg", STORAGE)
    assert not gc.is_fetchable("http://abc.supabase.co/a.jpg", STORAGE)
    assert not gc.is_fetchable(f"https://abc.supabase.co.evil.example/a.jpg", STORAGE)
    assert not gc.is_fetchable(None, STORAGE)


def test_with_hex_tag_replaces_any_old_reading_and_keeps_other_tags():
    assert gc.with_hex_tag(["status:laundry", "hex:#000000"], "#B7410E") == ["status:laundry", "hex:#B7410E"]


def test_needs_measuring_skips_items_already_measured():
    assert gc.needs_measuring({"tags": []})
    assert not gc.needs_measuring({"tags": ["hex:#B7410E"]})


# -- look check uses the measured color --

def _rust_named_black(tags):
    return {"id": "1", "name": "Crew tee", "category": "tops", "color": "black", "tags": tags}


def test_look_check_prefers_the_measured_hex_over_the_color_name():
    r = look_check.check_outfit([_rust_named_black(["hex:#B7410E"])], color_profile={"season": "autumn"})
    color = next(c for c in r["checks"] if c["check"] == "color_on_you")

    assert color["status"] == "pass"
    assert r["garment_colors_measured"] is True


def test_outfit_is_only_labeled_measured_when_every_clothing_item_is():
    outfit = [
        _rust_named_black(["hex:#B7410E"]),
        {"id": "2", "name": "Jeans", "category": "bottoms", "color": "denim", "tags": []},
    ]

    assert look_check.check_outfit(outfit)["garment_colors_measured"] is False


def test_shoes_do_not_block_the_measured_label():
    outfit = [
        _rust_named_black(["hex:#B7410E"]),
        {"id": "2", "name": "Loafers", "category": "shoes", "color": "tan", "tags": []},
    ]

    assert look_check.check_outfit(outfit)["garment_colors_measured"] is True
