"""URL -> product image scraper. Uses og:image meta tag (works on most e-commerce).

Shared by the manual "paste a link" wardrobe flow (`POST /scrape/product-url`) and
Aria's `lookup_product_from_url` tool -- both need the same og:image/largest-<img>
extraction, so it lives here once instead of being duplicated.
"""
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from fastapi import HTTPException

from models.schemas import ScrapeResponse
from services.anthropic_service import suggest_category_from_url

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _extract_meta(soup: BeautifulSoup, prop: str) -> str | None:
    tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
    if tag and tag.get("content"):
        return tag["content"]
    return None


def _extract_largest_img(soup: BeautifulSoup, base_url: str) -> str | None:
    """Fallback: find the largest <img> by width attribute."""
    imgs = soup.find_all("img")
    if not imgs:
        return None
    # Best-effort heuristic
    candidates = []
    for img in imgs:
        src = img.get("src") or img.get("data-src")
        if not src:
            continue
        try:
            width = int(img.get("width", 0) or 0)
        except (TypeError, ValueError):
            width = 0
        candidates.append((width, urljoin(base_url, src)))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


async def scrape_product(url: str) -> ScrapeResponse:
    """
    Scrape product image and name from any URL.
    Tries og:image first; falls back to largest <img>.

    Known limitations:
    - Amazon often blocks scraping → user pastes image URL directly via /api/wardrobe/from-url
    - Heavily-React sites may not have og:image
    """
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    # If the pasted link is already a direct image (e.g. an H&M image URL the user copied
    # via "Copy image address"), use it as-is - no page scrape needed. This makes
    # bot-blocked retailers (H&M, Amazon, Zara) usable: right-click the product image ->
    # Copy image address -> paste here.
    path = url.split("?")[0].lower()
    if path.endswith((".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif")):
        name = url.split("/")[-1].split("?")[0].rsplit(".", 1)[0].replace("-", " ").replace("_", " ")[:80] or "Product"
        return ScrapeResponse(
            image_url=url, name=name, source_url=url,
            suggested_category=suggest_category_from_url(name) or "tops",
        )

    BLOCKED_MSG = (
        "This retailer (H&M, Amazon, Zara and similar) blocks automatic scraping. "
        "Right-click the product image, choose 'Copy image address', and paste that "
        "image link here instead."
    )

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15.0, headers=HEADERS) as client:
            resp = await client.get(url)
            # Some links resolve directly to an image even without an image extension.
            if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image/"):
                name = url.split("/")[-1].split("?")[0][:80] or "Product"
                return ScrapeResponse(
                    image_url=url, name=name, source_url=url,
                    suggested_category=suggest_category_from_url(name) or "tops",
                )
    except httpx.TimeoutException:
        raise HTTPException(408, "URL timed out. " + BLOCKED_MSG)
    except Exception as e:
        raise HTTPException(400, f"Could not fetch URL: {e}")

    if resp.status_code != 200:
        raise HTTPException(400, f"Site returned {resp.status_code}. {BLOCKED_MSG}")

    soup = BeautifulSoup(resp.text, "html.parser")

    image_url = _extract_meta(soup, "og:image")
    if not image_url:
        image_url = _extract_largest_img(soup, url)

    if not image_url:
        raise HTTPException(400, "Could not find a product image on the page. " + BLOCKED_MSG)

    if image_url.startswith("//"):
        image_url = "https:" + image_url

    name = _extract_meta(soup, "og:title")
    if not name and soup.title:
        name = soup.title.text.strip()
    name = (name or "Product")[:80]

    suggested_category = suggest_category_from_url(name) or "tops"

    return ScrapeResponse(
        image_url=image_url,
        name=name,
        source_url=url,
        suggested_category=suggested_category,
    )
