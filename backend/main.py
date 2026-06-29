"""StyleAI FastAPI app entry point."""
import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

from routers import avatar, tryon, wardrobe, outfits, scrape, stylist, friends  # noqa: E402

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

app.include_router(avatar.router,    prefix="/api/avatar",    tags=["Avatar"])
app.include_router(tryon.router,     prefix="/api/tryon",     tags=["Try-On"])
app.include_router(wardrobe.router,  prefix="/api/wardrobe",  tags=["Wardrobe"])
app.include_router(outfits.router,   prefix="/api/outfits",   tags=["Outfits"])
app.include_router(scrape.router,    prefix="/api/scrape",    tags=["Scrape"])
app.include_router(stylist.router,   prefix="/api/stylist",   tags=["Stylist"])
app.include_router(friends.router,   prefix="/api/friends",   tags=["Friends"])


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"app": "StyleAI", "version": "2.0.0", "docs": "/docs"}
