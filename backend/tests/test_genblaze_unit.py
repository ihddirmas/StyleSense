"""Unit tests for Genblaze/B2 media service (no network)."""
import os
import unittest
from unittest.mock import patch

from services import genblaze_media_service


class GenblazeMediaConfigTests(unittest.TestCase):
    def test_not_configured_without_b2(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(genblaze_media_service.is_configured())

    def test_configured_with_b2_env(self):
        env = {
            "B2_BUCKET": "my-media-bucket",
            "B2_KEY_ID": "key",
            "B2_APP_KEY": "secret",
            "GENBLAZE_MEDIA": "1",
        }
        with patch.dict(os.environ, env, clear=True):
            self.assertTrue(genblaze_media_service.is_configured())

    def test_disabled_flag(self):
        env = {
            "B2_BUCKET": "my-media-bucket",
            "B2_KEY_ID": "key",
            "B2_APP_KEY": "secret",
            "GENBLAZE_MEDIA": "0",
        }
        with patch.dict(os.environ, env, clear=True):
            self.assertFalse(genblaze_media_service.is_configured())

    def test_build_motion_prompt_includes_scene(self):
        out = genblaze_media_service._build_motion_prompt("walk forward", "a beach at sunset")
        self.assertIn("beach at sunset", out)
        self.assertIn("walk forward", out)


if __name__ == "__main__":
    unittest.main()
