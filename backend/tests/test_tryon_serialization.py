"""Unit tests for try-on API serialization (B2 video preference)."""
import unittest

from services.tryon_serialization import (
    archive_fields,
    preferred_video_url,
    serialize_tryon,
    video_archive_fields,
)


class TryonSerializationTests(unittest.TestCase):
    def test_preferred_video_url_prefers_b2(self):
        row = {"b2_video_url": "https://b2.example/v.mp4", "result_video_url": "https://runway.example/v.mp4"}
        self.assertEqual(preferred_video_url(row), "https://b2.example/v.mp4")

    def test_preferred_video_url_falls_back_to_runway(self):
        row = {"result_video_url": "https://runway.example/v.mp4"}
        self.assertEqual(preferred_video_url(row), "https://runway.example/v.mp4")

    def test_serialize_tryon_rewrites_result_video_url(self):
        row = {
            "id": "abc",
            "result_image_url": "https://supabase.example/img.jpg",
            "b2_video_url": "https://b2.example/v.mp4",
            "result_video_url": "https://runway.example/v.mp4",
        }
        out = serialize_tryon(row)
        self.assertEqual(out["result_video_url"], "https://b2.example/v.mp4")
        self.assertEqual(out["b2_video_url"], "https://b2.example/v.mp4")

    def test_archive_fields_empty_without_manifest(self):
        self.assertEqual(archive_fields({}), {})

    def test_archive_fields_maps_ingest_response(self):
        self.assertEqual(
            archive_fields({"b2_url": "https://b2.example/img.jpg", "manifest_hash": "abc123"}),
            {"b2_image_url": "https://b2.example/img.jpg", "image_manifest_hash": "abc123"},
        )

    def test_video_archive_fields(self):
        self.assertEqual(
            video_archive_fields({"video_url": "https://b2.example/v.mp4", "manifest_hash": "deadbeef"}),
            {"b2_video_url": "https://b2.example/v.mp4", "video_manifest_hash": "deadbeef"},
        )


if __name__ == "__main__":
    unittest.main()
