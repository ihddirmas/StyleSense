"""Unit tests for aria_memory_service."""
import unittest
from pathlib import Path
from unittest.mock import patch

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from services import aria_memory_service


class AriaMemoryTests(unittest.TestCase):
    @patch("services.aria_memory_service.supabase_service.get_user")
    @patch("services.aria_memory_service.save_memory")
    def test_append_feedback_up(self, save_mock, get_mock):
        get_mock.return_value = {"aria_memory": {}}
        mem = aria_memory_service.append_verdict_feedback(
            "user-1", rating="up", verdict="Suits you", note="loves minimal lines"
        )
        self.assertEqual(mem["verdict_feedback"][-1]["rating"], "up")
        self.assertIn("loves minimal lines", mem["loves"])
        save_mock.assert_called_once()

    def test_format_empty(self):
        self.assertIn("no long-term", aria_memory_service.format_for_prompt({}).lower())


if __name__ == "__main__":
    unittest.main()
