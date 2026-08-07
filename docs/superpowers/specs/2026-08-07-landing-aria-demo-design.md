# Landing-page Aria demo — design spec

Date: 2026-08-07

## Context

The current marketing landing page (`frontend/app/page.tsx`) shows the product via `ProductDemo.tsx`, a GSAP scroll-driven crossfade between 4 static screenshots — no interactivity. Playwright research on Thunkable and Base44 (two "vibe coding" landing pages that visibly let visitors "use the app" on the page) showed that in both cases the interactive moment is a real prompt box wired to their AI, where the visitor's input is captured and carried into signup — the actual expensive generation only happens after auth. Neither site gives away its core paid compute for free.

StyleSense's equivalent is Aria, the AI stylist chat (`aria_graph.run_aria`, Claude Haiku). Unlike Runway image generation (2-60 credits per call against a 50,000-credit hackathon budget), a chat turn is cheap enough to offer anonymously with basic rate limiting. But Aria's actual value is personalization (Kibbe body type, color season, wardrobe-aware advice) — a context-free "what should I wear" demo would just be generic fashion chat, not a real demonstration of the product. The fix is a fixed fictional "demo closet" persona with real Kibbe/color data, so anonymous visitors get genuinely wardrobe-aware Aria answers without needing their own data or an authenticated session.

Goal: replace the static screenshot section with a live, rate-limited, unauthenticated Aria chat demo grounded in a fixture persona, sitting between `HeroSection` and the existing `ProductDemo`, with a persistent signup CTA.

## Backend

**New route**: `POST /api/stylist/demo-chat`, added to `backend/routers/stylist.py`. No `Depends(current_user)` — the only unauthenticated AI-calling route in the backend.

Request/response reuse the existing `StylistChatRequest`/`StylistChatResponse` shape (messages list) so the frontend can use the same message-list mental model as the real chat, minus photo/tool-confirm fields.

```python
@router.post("/demo-chat", response_model=StylistChatResponse)
async def demo_chat(req: StylistChatRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    await check_rate_limit_async(client_ip, "demo_chat", limit=8, window_seconds=3600)

    if not req.messages:
        raise HTTPException(400, "Need at least one message.")
    if len(req.messages) > 12:  # ~6 user/assistant turn pairs
        raise HTTPException(400, "Demo conversation limit reached — sign up to keep chatting.")

    messages = [m.model_dump() for m in req.messages]
    result = await _run_blocking(
        aria_graph.run_aria,
        user_id="demo",
        messages=messages,
        wardrobe=DEMO_WARDROBE,
        color_profile=DEMO_COLOR_PROFILE,
        kibbe_analysis=DEMO_KIBBE_ANALYSIS,
    )
    return StylistChatResponse(reply=result["reply"], suggested_item_ids=result.get("item_ids") or [],
                                occasion=result.get("occasion"), scene=result.get("scene"))
```

Notes on why this is safe against the existing graph:

- `aria_graph._ensure_profile` only computes/caches a color or Kibbe profile when `state.get("color_profile")`/`kibbe_analysis` is falsy — so pre-seeding both in the initial state (see `run_aria` change below) means it never touches `supabase_service.get_user("demo")` for real data, and never upserts anything for the "demo" id.
- `usage_limits.tryon_capped("demo")` and `supabase_service.get_user("demo")` are both read-only SELECTs that return empty/False for an unknown id — no crash, no writes, confirmed by reading `usage_limits.py` and `supabase_service.py`.
- Tool calls: `_advise` binds the full `aria_tools.ANTHROPIC_TOOLS` regardless of caller. Read-only tools (e.g. `lookup_product_from_url`) execute automatically as today. Confirm-required tools (e.g. `generate_tryon`, `add_wardrobe_items`) come back as a `pending_action` in the result, same as the real chat endpoint — but the demo response model here drops `pending_action` from the returned fields, and the frontend never calls `/tool-confirm` (unauthenticated, would 401 via that route's own auth dependency anyway), so any such proposal is inert by construction, not by trusting the model to not ask. To reduce Aria proposing pointless actions, the demo system prompt addition below explicitly tells her tools aren't available.

**Small `aria_graph.run_aria` signature change** (`backend/graphs/aria_graph.py:376`): add optional `color_profile: Optional[dict] = None, kibbe_analysis: Optional[dict] = None` params, merged into the initial graph state dict. This is additive and backward-compatible — existing callers (`routers/stylist.py:91-97`) are unaffected since they don't pass these and the graph's own `_ensure_profile` node fills them in as before.

**Demo persona fixture**: new module-level constants near the top of `stylist.py` (or a small `services/demo_persona.py` if it grows) —

- `DEMO_WARDROBE`: 5-6 items shaped like real wardrobe rows (`id`, `name`, `category`, `color`, `tags`) — e.g. a navy blazer, white linen shirt, tailored trousers, little black dress, denim jacket, ballet flats. Enough variety for Aria to give a real "what goes with X" answer.
- `DEMO_KIBBE_ANALYSIS`: a fixed `{"kibbe_type": "...", ...}` matching the shape `kibbe_service.format_kibbe_profile` expects.
- `DEMO_COLOR_PROFILE`: a fixed `{"season": "...", "undertone": "...", "flattering_colors": [...], ...}` matching `color_service.format_color_profile`.
- A short persona name/label (e.g. "Maya") for the frontend's "meet Aria via Maya's closet" framing — cosmetic only, not sent to the model beyond flavor text if at all.

**System prompt note for demo mode**: the existing `SYSTEM_TEMPLATE` used by `_advise` doesn't need forking — passing real `wardrobe`/`color_profile`/`kibbe_analysis` values already grounds Aria correctly. The only addition is one line appended when `user_id == "demo"` (checked in `demo_chat`, appended to the outgoing message or via a small template variant) telling Aria she can't add items to a wardrobe or generate try-ons in this preview and should suggest signing up if asked.

## Frontend

**New component**: `frontend/components/landing/AriaDemo.tsx`, inserted into `frontend/app/page.tsx` between `<HeroSection />` and `<ProductDemo />`.

- Header: persona intro ("Meet Aria — ask her about Maya's closet") + a horizontal thumbnail/tag row of the fixture wardrobe items (icons or generic swatches, not real photos, since there's no image asset per fixture item — confirm/generate simple placeholder art as part of implementation).
- Chat thread: reuses the visual bubble pattern from `frontend/app/stylist/page.tsx` (user bubbles right-aligned, Aria bubbles left-aligned) for visual consistency, implemented as local JSX in the new component rather than extracting a shared component (small enough surface, avoids a premature abstraction).
- Seed state: opens with one hardcoded Aria greeting message plus 3 clickable example prompts (mirrors Thunkable's chip pattern), e.g. "What goes with the navy blazer?", "What should Maya wear to a summer wedding?", "Which colors suit her most?".
- Local state only: `useState<Message[]>` for the thread, `useState<boolean>` for a sending/loading flag. Nothing persisted — reload resets to the seed state.
- Send flow: plain `fetch("/api/stylist/demo-chat", { method: "POST", body: JSON.stringify({ messages }) })` — not `lib/api.ts`, since that helper always attaches a Supabase JWT this route doesn't use.
- Rate-limit / turn-cap UX: on a 429 or the 400 turn-limit response, replace the input with an inline message — "You've hit the demo limit — sign up to keep chatting with Aria about your own closet" — linking to `/signup`.
- CTA: a persistent "Sign up to try this on your own wardrobe →" link to `/signup` beneath the chat at all times (not gated on hitting the limit), matching the earlier decision not to carry any transcript/param into signup.
- Loading state: reuse the existing typing-indicator/loading pattern from the stylist page chat if one exists, otherwise a simple three-dot pulse — small enough to implement inline.

## Testing

- Backend: a pytest for `/api/stylist/demo-chat` — happy path (mocked `aria_graph.run_aria`) returns a reply; rate-limit path (mock `check_rate_limit_async` to raise) returns 429; turn-cap path (13-message request) returns 400; confirm the route never calls `supabase_service.upsert_user`.
- Frontend: no new E2E test required for launch (marketing page, not a critical auth-gated flow per existing E2E priorities), but a quick manual Playwright pass before shipping: load `/`, send 2-3 real messages, confirm real Aria replies referencing the fixture wardrobe, trigger the 429 path by exceeding the limit, verify the CTA is always visible.

## Out of scope (for now)

- Carrying the demo transcript/last question into `/signup` (explicitly deferred — not worth the backend complexity for the payoff right now).
- Selfie upload or product-URL paste on the landing page (considered, rejected in favor of the chat-first pattern matching Thunkable/Base44 more directly).
- A real Supabase-backed demo account (fixture data in Python is sufficient and avoids seeding/maintaining a fake user row).
