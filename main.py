"""
main.py — Application entry point for The Bridge Protocol API.
Run with: uvicorn main:app --reload

On Vercel, ALL traffic routes through this FastAPI app (including the frontend).
So this file also serves the frontend HTML, CSS, and JS.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.routers import tasks, bids, users

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# __file__ is always main.py at the project root — works both locally and on Vercel
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

# ---------------------------------------------------------------------------
# App initialisation
# ---------------------------------------------------------------------------
app = FastAPI(
    title=settings.APP_TITLE,
    version=settings.APP_VERSION,
    description=settings.APP_DESCRIPTION,
    docs_url="/docs",       # Swagger UI  → /docs
    redoc_url="/redoc",     # ReDoc UI    → /redoc
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API Routers  (registered first so they take priority over catch-all)
# ---------------------------------------------------------------------------
app.include_router(tasks.router)
app.include_router(bids.router)
app.include_router(users.router)

# ---------------------------------------------------------------------------
# Static assets — serve frontend/js/* and frontend/style.css
# ---------------------------------------------------------------------------
if os.path.isdir(os.path.join(FRONTEND_DIR, "js")):
    app.mount(
        "/js",
        StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")),
        name="js",
    )

@app.get("/style.css", include_in_schema=False)
def serve_css():
    return FileResponse(
        os.path.join(FRONTEND_DIR, "style.css"),
        media_type="text/css",
    )

# ---------------------------------------------------------------------------
# Frontend SPA — serve index.html for every unmatched route
# (This MUST be last so API routes and static mounts take priority)
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str = ""):
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path, media_type="text/html")
    # Fallback if frontend is somehow missing (pure API mode)
    return {
        "status": "online",
        "service": settings.APP_TITLE,
        "version": settings.APP_VERSION,
        "docs": "/docs",
    }
