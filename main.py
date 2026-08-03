"""
main.py — Application entry point for The Bridge Protocol API.
Run with: uvicorn main:app --reload

On Vercel:
  - /api/* routes are handled by this FastAPI app (via api/index.py)
  - Static files (HTML, CSS, JS) are served by Vercel's CDN from frontend/
  - Routing is controlled entirely by vercel.json
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import tasks, bids, users

# ---------------------------------------------------------------------------
# App initialisation
# ---------------------------------------------------------------------------
app = FastAPI(
    title=settings.APP_TITLE,
    version=settings.APP_VERSION,
    description=settings.APP_DESCRIPTION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — allow all origins so the Vercel frontend can call the API
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API Routers
# ---------------------------------------------------------------------------
app.include_router(tasks.router)
app.include_router(bids.router)
app.include_router(users.router)

# ---------------------------------------------------------------------------
# Health check — /api/health confirms the backend is running
# ---------------------------------------------------------------------------
@app.get("/api/health", tags=["Health"])
def health():
    """Quick health-check — confirms the API is online."""
    return {
        "status": "online",
        "service": settings.APP_TITLE,
        "version": settings.APP_VERSION,
    }
