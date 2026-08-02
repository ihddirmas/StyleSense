"""Normalize try_on_results rows for API responses.

Supabase URLs stay the hot CDN for still images. B2 is the cold archive + durable
video sink; clients receive B2 video URLs when present.
"""
from __future__ import annotations

from typing import Any, Optional


def preferred_video_url(row: Optional[dict]) -> Optional[str]:
    if not row:
        return None
    return (row.get("b2_video_url") or row.get("result_video_url") or "").strip() or None


def serialize_tryon(row: Optional[dict]) -> Optional[dict]:
    if not row:
        return row
    out = dict(row)
    out["result_video_url"] = preferred_video_url(row)
    if row.get("b2_image_url"):
        out["b2_image_url"] = row["b2_image_url"]
    if row.get("image_manifest_hash"):
        out["image_manifest_hash"] = row["image_manifest_hash"]
    if row.get("b2_video_url"):
        out["b2_video_url"] = row["b2_video_url"]
    if row.get("video_manifest_hash"):
        out["video_manifest_hash"] = row["video_manifest_hash"]
    return out


def serialize_tryons(rows: list[dict]) -> list[dict]:
    return [serialize_tryon(r) for r in rows]


def archive_fields(prov: dict[str, Any]) -> dict[str, Any]:
    """Subset for generate/animate responses when B2 ingest succeeded."""
    if not prov.get("manifest_hash"):
        return {}
    return {
        "b2_image_url": prov.get("b2_url"),
        "image_manifest_hash": prov.get("manifest_hash"),
    }


def video_archive_fields(result: dict[str, Any]) -> dict[str, Any]:
    if not result.get("manifest_hash"):
        return {}
    return {
        "b2_video_url": result.get("video_url"),
        "video_manifest_hash": result.get("manifest_hash"),
    }
