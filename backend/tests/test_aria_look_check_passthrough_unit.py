"""
Unit tests: check_outfit results survive Aria's tool loop and reach the response,
so the chat can render them as Look Check cards.

No network: the Anthropic client is faked. Dummy settings are set before import
because anthropic_service and db read them at module load; nothing connects.
Run with: .\\venv\\Scripts\\python.exe -m pytest tests/test_aria_look_check_passthrough_unit.py -v
"""
import os
import sys
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/unused")
os.environ.setdefault("SUPABASE_URL", "https://unused.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "unused")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from graphs import aria_graph
from services import anthropic_service

WARDROBE = [
    {"id": "top-1", "name": "Black deep-V top", "category": "tops", "color": "black", "image_url": "https://x/top.jpg"},
    {"id": "shoe-1", "name": "Stilettos", "category": "shoes", "color": "black", "image_url": "https://x/shoe.jpg"},
]
USER_STATE = {
    "user_id": "user-1",
    "messages": [{"role": "user", "content": "Can I wear these to the office party?"}],
    "wardrobe": WARDROBE,
}


def _tool_use(tool_id: str, item_ids: list[str]) -> SimpleNamespace:
    block = SimpleNamespace(
        type="tool_use", id=tool_id, name="check_outfit",
        input={"item_ids": item_ids, "occasion": "office_party", "walk_minutes": 25},
    )
    return SimpleNamespace(stop_reason="tool_use", content=[block])


def _text(reply: str) -> SimpleNamespace:
    return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=reply)])


def _advise_with(monkeypatch, responses: list[SimpleNamespace]) -> dict:
    queue = iter(responses)
    monkeypatch.setattr(anthropic_service.client.messages, "create", lambda **_: next(queue))
    return aria_graph._advise(USER_STATE)


def test_check_outfit_result_reaches_the_response_with_item_names(monkeypatch):
    result = _advise_with(monkeypatch, [_tool_use("t1", ["top-1", "shoe-1"]), _text("Skip this one.")])

    assert len(result["look_checks"]) == 1
    check = result["look_checks"][0]
    assert check["verdict"] in {"wear", "tweak", "skip"}
    assert len(check["checks"]) == 7
    assert [i["name"] for i in check["items"]] == ["Black deep-V top", "Stilettos"]


def test_every_check_outfit_call_in_a_turn_is_kept_for_before_and_after(monkeypatch):
    result = _advise_with(monkeypatch, [
        _tool_use("t1", ["top-1"]), _tool_use("t2", ["shoe-1"]), _text("Here's the swap."),
    ])

    assert [c["items"][0]["id"] for c in result["look_checks"]] == ["top-1", "shoe-1"]


def test_aria_never_asks_for_parallel_tools_because_the_loop_answers_one_per_round(monkeypatch):
    requests = []

    def fake_create(**kwargs):
        requests.append(kwargs)
        return _text("Hello.")

    monkeypatch.setattr(anthropic_service.client.messages, "create", fake_create)
    aria_graph._advise(USER_STATE)

    assert requests[0]["tool_choice"] == {"type": "auto", "disable_parallel_tool_use": True}


def test_replies_without_check_outfit_have_no_look_checks(monkeypatch):
    result = _advise_with(monkeypatch, [_text("Hello.")])

    assert result["look_checks"] == []


# -- Aria only sees laundry etc. as unavailable -------------------------------

def test_prompt_marks_items_that_cannot_be_worn_today():
    wardrobe = anthropic_service._format_wardrobe([
        {"id": "a", "name": "Rust top", "category": "tops", "tags": ["status:laundry"]},
        {"id": "b", "name": "Cream top", "category": "tops", "tags": []},
        {"id": "c", "name": "Linen shirt", "category": "tops", "tags": ["status:needs_iron"]},
    ])

    rust, cream, linen = [next(l for l in wardrobe.splitlines() if n in l) for n in ("Rust top", "Cream top", "Linen shirt")]
    assert "UNAVAILABLE TODAY" in rust and "laundry" in rust
    assert "UNAVAILABLE" not in cream
    assert "UNAVAILABLE" not in linen and "needs ironing" in linen
