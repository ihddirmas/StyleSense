"""Image validation and helpers."""
import io
import ipaddress
import socket
from urllib.parse import urlparse

import httpx
from PIL import Image

MAX_BYTES = 16 * 1024 * 1024  # 16MB - matches Runway URL upload limit
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MIN_DIM = 256  # pixels


def _assert_public_host(hostname: str) -> None:
    """Resolve hostname and reject loopback/private/link-local/metadata targets (SSRF guard)."""
    if not hostname:
        raise ValueError("Missing host in URL.")
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as e:
        raise ValueError(f"Could not resolve host: {e}")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            raise ValueError(f"Refusing to fetch from non-public address: {ip}")


def fetch_image_from_url(url: str, timeout: float = 20.0) -> tuple[bytes, str]:
    """
    SSRF-safe image fetch from an untrusted external URL. Validates the scheme,
    rejects private/loopback/link-local/metadata IPs (all resolved addresses),
    disables redirects (each hop could rebind to a private target), and requires
    an image/* Content-Type. Returns (bytes, normalized_mime). Raises ValueError.
    """
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        raise ValueError(f"Unsupported URL scheme: {p.scheme}")
    _assert_public_host(p.hostname or "")

    r = httpx.get(url, timeout=timeout, follow_redirects=False,
                  headers={"User-Agent": "Mozilla/5.0 StyleSense/1.0"})
    r.raise_for_status()
    ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
    if not ctype.startswith("image/"):
        raise ValueError(f"URL did not return an image (Content-Type: {ctype or 'none'}).")
    if ctype not in ALLOWED_MIME:
        ctype = "image/jpeg"
    if len(r.content) > MAX_BYTES:
        raise ValueError(f"Image too large ({len(r.content)/1024/1024:.1f}MB). Max 16MB.")
    return r.content, ctype


def validate_image_bytes(data: bytes, content_type: str) -> tuple[int, int]:
    """
    Validate an uploaded image. Returns (width, height) on success.
    Raises ValueError on any problem.
    """
    if len(data) > MAX_BYTES:
        raise ValueError(f"Image too large ({len(data)/1024/1024:.1f}MB). Max 16MB.")
    if content_type not in ALLOWED_MIME:
        raise ValueError(f"Unsupported MIME type: {content_type}. Use JPEG, PNG, or WebP.")
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()  # quick integrity check
    except Exception as e:
        raise ValueError(f"Invalid image file: {e}")

    img = Image.open(io.BytesIO(data))  # re-open after verify
    w, h = img.size
    if w < MIN_DIM or h < MIN_DIM:
        raise ValueError(f"Image too small ({w}x{h}). Min {MIN_DIM}x{MIN_DIM}.")
    return w, h


def pad_to_ratio_range(data: bytes, min_ratio: float = 0.5, max_ratio: float = 2.0) -> bytes:
    """
    Runway references require width/height ratio within [0.5, 2.0]. Tall phone
    photos (e.g. 0.46) get rejected. Pad such images with white into range; return
    the original bytes if already valid or on any error (caller still has a usable image).
    """
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
        w, h = img.size
        ratio = w / h
        if min_ratio <= ratio <= max_ratio:
            return data
        if ratio < min_ratio:                       # too tall -> pad width
            new_w, new_h = int(h * min_ratio) + 2, h
            canvas = Image.new("RGB", (new_w, new_h), (255, 255, 255))
            canvas.paste(img, ((new_w - w) // 2, 0))
        else:                                       # too wide -> pad height
            new_w, new_h = w, int(w / max_ratio) + 2
            canvas = Image.new("RGB", (new_w, new_h), (255, 255, 255))
            canvas.paste(img, (0, (new_h - h) // 2))
        out = io.BytesIO()
        canvas.save(out, format="JPEG", quality=92)
        return out.getvalue()
    except Exception:
        return data
