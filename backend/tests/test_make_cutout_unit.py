"""Unit tests for make_cutout occlusion-check skip (no network)."""
import io
import unittest
from unittest.mock import patch

from PIL import Image

from services.garment_cleaner import make_cutout


def _solid_jpeg(color=(200, 40, 40), size=(200, 260)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG")
    return buf.getvalue()


class MakeCutoutSkipTests(unittest.TestCase):
    def test_skip_occlusion_check_does_not_call_verify(self):
        rgba = Image.new("RGBA", (100, 140), (10, 20, 30, 255))

        with patch("services.garment_cleaner.verify_clean_garment") as verify, patch(
            "services.garment_cleaner._cutout_with_model",
            return_value=(rgba, 0.5),
        ), patch(
            "services.garment_cleaner._fit_portrait_3x4_rgba",
            side_effect=lambda im: im,
        ):
            out = make_cutout(_solid_jpeg(), category="dresses", skip_occlusion_check=True)

        verify.assert_not_called()
        self.assertIsNotNone(out)
        self.assertTrue(out.startswith(b"\x89PNG"))

    def test_occlusion_check_runs_by_default(self):
        with patch(
            "services.garment_cleaner.verify_clean_garment",
            return_value=(False, ["person visible"]),
        ) as verify, patch(
            "services.garment_cleaner._cutout_with_model",
        ) as cutout:
            out = make_cutout(_solid_jpeg(), category="tops")

        verify.assert_called_once()
        cutout.assert_not_called()
        self.assertIsNone(out)


if __name__ == "__main__":
    unittest.main()
