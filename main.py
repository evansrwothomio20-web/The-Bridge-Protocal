"""
main.py — Application entry point for The Bridge Protocol API.
Run with: uvicorn main:app --reload

On Vercel, ALL traffic routes through this FastAPI app.
API routes (/api/*) are registered first and take priority.
Everything else is served from the frontend/ directory as a static SPA.
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import tasks, bids, users

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

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
# API Routers — MUST be registered before the static file mount
# so that /api/* routes take priority over the catch-all
# ---------------------------------------------------------------------------
app.include_router(tasks.router)
app.include_router(bids.router)
app.include_router(users.router)

# ---------------------------------------------------------------------------
# Frontend SPA — mount the entire frontend/ folder at the root.
#
# html=True enables SPA mode:
#   • /style.css        → frontend/style.css
#   • /js/app.js        → frontend/js/app.js
#   • /                 → frontend/index.html
#   • /any-other-path   → frontend/index.html  (SPA fallback)
#
# This is registered LAST so API routes above take priority.
# ---------------------------------------------------------------------------
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
