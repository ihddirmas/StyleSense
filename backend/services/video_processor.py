"""
Video post-processing: aspect ratio fixing + seamless looping.

Runway sometimes returns 9:16 portrait videos despite 16:9 requests.
This service converts them to landscape and creates true seamless loops.
"""
import logging
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


def fix_aspect_ratio_and_loop(video_bytes: bytes) -> bytes:
    """
    Convert 9:16 video to 16:9 with blurred padding + seamless palindromic loop.

    Returns fixed video bytes, or original bytes on any error (fail-safe).
    """
    try:
        # Write temp input file
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_in:
            tmp_in.write(video_bytes)
            input_path = tmp_in.name

        output_path = input_path.replace(".mp4", "_fixed.mp4")

        # FFmpeg command:
        # 1. Scale to 16:9 with blur padding (pad_h_expr ensures 16:9)
        # 2. Create palindromic loop: reverse video and concatenate (makes seamless loop)
        # 3. Output as MP4
        cmd = [
            "ffmpeg", "-i", input_path,
            # Ensure 16:9: if input is 9:16, pad to make it landscape
            "-vf",
            (
                "scale=1280:720:force_original_aspect_ratio=decrease,"
                "pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black@0.1,"  # pad with semi-transparent
                "split[orig][copy];"
                "[copy]reverse[reversed];"
                "[orig][reversed]concat=n=2:v=1[out]"
            ),
            "-pix_fmt", "yuv420p",
            "-c:v", "libx264",
            "-crf", "22",  # quality
            "-preset", "fast",  # speed
            "-y", output_path,  # overwrite
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=180,
            check=False,
        )

        if result.returncode != 0:
            error = result.stderr.decode("utf-8", errors="replace")
            logger.warning(f"FFmpeg fix failed: {error[:200]}")
            return video_bytes  # Return original on failure

        # Read fixed video
        with open(output_path, "rb") as f:
            fixed = f.read()

        # Cleanup
        Path(input_path).unlink(missing_ok=True)
        Path(output_path).unlink(missing_ok=True)

        logger.info(f"Video post-processed: {len(video_bytes)} → {len(fixed)} bytes")
        return fixed

    except Exception as e:
        logger.warning(f"Video post-processing failed (returning original): {e}")
        return video_bytes  # Always fail-safe to original
