"""
database.py — Supabase REST API client for The Bridge Protocol.

Instead of the supabase Python package (which pulls in Rust-compiled
dependencies), we call Supabase's PostgREST API directly using httpx.
This is 100% pure Python and works with a plain pip install.

Supabase exposes every table as a standard REST endpoint:
  GET    /rest/v1/tasks?select=*&status=eq.open
  POST   /rest/v1/tasks
  PATCH  /rest/v1/tasks?id=eq.<id>
  DELETE /rest/v1/tasks?id=eq.<id>
"""

from app.config import settings

# Base URL for all table operations
REST_URL = f"{settings.SUPABASE_URL}/rest/v1"


def get_headers(prefer: str = "") -> dict:
    """
    Build the headers required by every Supabase REST request.

    Args:
        prefer: Optional PostgREST 'Prefer' header value, e.g.
                'return=representation' to get the inserted/updated row back.
    """
    headers = {
        "apikey": settings.SUPABASE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers
