"""
api/index.py — Vercel serverless entry point for The Bridge Protocol.

Vercel's Python runtime expects a variable named `app` inside the `api/` folder.
This file is a thin shim that re-exports the FastAPI `app` from main.py.

How Vercel resolves this:
  - Any request to /api/* is rewritten → /api/index (this file)
  - Vercel imports `app` from here and runs it as an ASGI handler
"""

# Ensure the project root is on the Python path so `from main import app` works
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app  # noqa: F401, E402 — Vercel looks for `app` here
