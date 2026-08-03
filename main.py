"""
main.py — Application entry point for The Bridge Protocol API.
Run with: uvicorn main:app --reload

On Vercel, ALL traffic routes through this FastAPI app (via api/index.py).
API routes (/api/*) are registered first and take priority.
The frontend/ directory is bundled via vercel.json includeFiles.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from app.config import settings
from app.routers import tasks, bids, users

# ---------------------------------------------------------------------------
# Paths — try multiple locations in case Vercel places files differently
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Try the standard path first, then fallback options
_candidates = [
    os.path.join(BASE_DIR, "frontend"),                    # local / standard
    os.path.join(os.path.dirname(BASE_DIR), "frontend"),   # one level up
    "/var/task/frontend",                                   # Vercel Lambda root
]
FRONTEND_DIR = next((p for p in _candidates if os.path.isdir(p)), None)

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
# CORS Middleware
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API Routers — registered BEFORE the static mount so they take priority
# ---------------------------------------------------------------------------
app.include_router(tasks.router)
app.include_router(bids.router)
app.include_router(users.router)

# ---------------------------------------------------------------------------
# Debug route — visit /debug to verify paths at runtime on Vercel
# ---------------------------------------------------------------------------
@app.get("/debug", include_in_schema=False)
def debug_paths():
    return {
        "base_dir": BASE_DIR,
        "frontend_dir": FRONTEND_DIR,
        "frontend_found": FRONTEND_DIR is not None,
        "cwd": os.getcwd(),
        "file": __file__,
        "candidates_checked": {p: os.path.isdir(p) for p in _candidates},
    }

# ---------------------------------------------------------------------------
# Frontend SPA — StaticFiles(html=True) serves the entire frontend directory
# as a SPA: exact files (CSS/JS) are served at their paths, everything else
# falls back to index.html. Registered LAST so API routes take priority.
# ---------------------------------------------------------------------------
if FRONTEND_DIR:
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
else:
    # Fallback: tell the user what went wrong
    @app.get("/", include_in_schema=False)
    def no_frontend():
        return JSONResponse(
            status_code=503,
            content={
                "error": "Frontend not found",
                "base_dir": BASE_DIR,
                "cwd": os.getcwd(),
                "hint": "Visit /debug for path diagnostics",
            },
        )
