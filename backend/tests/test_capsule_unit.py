"""Unit tests for capsule planning and gap analysis (no network)."""
import unittest
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from services import capsule_service


WARDROBE = [
    {"id": "a1", "name": "White shirt", "category": "tops"},
    {"id": "a2", "name": "Navy trousers", "category": "bottoms"},
    {"id": "a3", "name": "Loafers", "category": "shoes"},
]


class CapsuleGapTests(unittest.TestCase):
    def test_list_gaps_detects_missing_outerwear(self):
        out = capsule_service.list_wardrobe_gaps(WARDROBE, dress_code="business", days=5)
        cats = {g["category"] for g in out["gaps"]}
        self.assertIn("outerwear", cats)

    def test_empty_wardrobe_many_gaps(self):
        out = capsule_service.list_wardrobe_gaps([], dress_code="business", days=3)
        self.assertGreaterEqual(len(out["gaps"]), 3)

    def test_plan_empty_wardrobe(self):
        out = capsule_service.plan_trip_capsule([], destination="Milan", days=5, dress_code="business")
        self.assertEqual(out["coverage_pct"], 0)
        self.assertEqual(out["daily_outfits"], [])


if __name__ == "__main__":
    unittest.main()
