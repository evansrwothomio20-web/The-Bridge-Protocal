"""
config.py — Centralized configuration for The Bridge Protocol API.
Loads environment variables from a .env file so secrets never live in code.
"""

import os
from typing import List
from dotenv import load_dotenv

# Load .env file from project root
load_dotenv()


class Settings:
    """Application-wide settings pulled from environment variables."""

    APP_TITLE: str = "The Bridge Protocol API"
    APP_VERSION: str = "1.0.0"
    APP_DESCRIPTION: str = (
        "Backend API for The Bridge Protocol — connecting clients with skilled workers."
    )

    # Supabase credentials — set these in your .env file
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

    # CORS — list the origins allowed to call this API
    # In production, replace "*" with your actual frontend URL
    ALLOWED_ORIGINS: List[str] = ["*"]

    def validate(self) -> None:
        """Raise a descriptive error if required settings are missing."""
        missing = []
        if not self.SUPABASE_URL:
            missing.append("SUPABASE_URL")
        if not self.SUPABASE_KEY:
            missing.append("SUPABASE_KEY")
        if missing:
            raise EnvironmentError(
                f"Missing required environment variable(s): {', '.join(missing)}. "
                "Please add them to your .env file."
            )


# Singleton instance used across the app
settings = Settings()
