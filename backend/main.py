"""StyleAI FastAPI app entry point."""
import base64
import json
import logging
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# PostHog product analytics + error tracking
# ---------------------------------------------------------------------------
POSTHOG_API_KEY = os.getenv("POSTHOG_API_KEY", "")
POSTHOG_HOST = os.getenv("POSTHOG_HOST", "https://us.i.posthog.com")
posthog = None

if POSTHOG_API_KEY:
    from posthog import Posthog

    posthog = Posthog(
        project_api_key=POSTHOG_API_KEY,
        host=POSTHOG_HOST,
        enable_exception_autocapture=True,
    )
    logger.info("PostHog initialized (exception autocapture on)")

# ---------------------------------------------------------------------------
# Sentry error monitoring (legacy — no-op until SENTRY_DSN is set)
# ---------------------------------------------------------------------------
SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=os.getenv("SENTRY_ENVIRONMENT", "development"),
        send_default_pii=True,
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "1.0")),
    )

from routers import avatar, tryon, wardrobe, outfits, scrape, stylist, friends, chat, media  # noqa: E402

app = FastAPI(
    title="StyleAI API",
    version="2.0.0",
    description="StyleAI backend (Runway + Anthropic + Supabase). Auth required on most routes.",
)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000", "http://127.0.0.1:3000"],
    # Allow the production domain plus every Vercel preview deploy
    # (each preview gets its own *.vercel.app subdomain).
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# PostHog middleware — captures exceptions with request context
# ---------------------------------------------------------------------------

def _extract_user_id_from_request(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        payload_b64 = auth.split(".")[1]
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        return payload.get("sub") or payload.get("id")
    except Exception:
        return None


@app.middleware("http")
async def posthog_exception_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        if posthog:
            distinct_id = _extract_user_id_from_request(request)
            posthog.capture_exception(
                e,
                distinct_id=distinct_id or "anonymous",
                properties={"path": str(request.url.path)},
            )
        raise


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Return JSON 500s so CORSMiddleware can attach headers (plain 500s show as 'Failed to fetch' in browsers)."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(avatar.router,    prefix="/api/avatar",    tags=["Avatar"])
app.include_router(tryon.router,     prefix="/api/tryon",     tags=["Try-On"])
app.include_router(wardrobe.router,  prefix="/api/wardrobe",  tags=["Wardrobe"])
app.include_router(outfits.router,   prefix="/api/outfits",   tags=["Outfits"])
app.include_router(scrape.router,    prefix="/api/scrape",    tags=["Scrape"])
app.include_router(stylist.router,   prefix="/api/stylist",   tags=["Stylist"])
app.include_router(friends.router,   prefix="/api/friends",   tags=["Friends"])
app.include_router(chat.router,      prefix="/api/chat",      tags=["Chat"])
app.include_router(media.router,     prefix="/api/media",     tags=["Media"])


@app.get("/health")
def health():
    from services import genblaze_media_service
    from services import db

    db_ok = False
    db_error: str | None = None
    try:
        row = db.query("SELECT 1 AS ok", fetch="one")
        db_ok = bool(row and row.get("ok") == 1)
    except Exception as exc:
        db_error = type(exc).__name__

    out = {
        "status": "ok" if db_ok else "degraded",
        "db_ok": db_ok,
        "b2_configured": genblaze_media_service.is_configured(),
        "genblaze_media": genblaze_media_service.is_configured(),
    }
    if db_error:
        out["db_error"] = db_error
    return out


@app.get("/")
def root():
    return {"app": "StyleAI", "version": "2.0.0", "docs": "/docs"}
