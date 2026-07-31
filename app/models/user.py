"""
models/user.py — Pydantic v1 schemas for user-related requests and responses.
"""

from typing import Optional
from pydantic import BaseModel, Field, validator


class UserCreate(BaseModel):
    """Payload required to register a new user (POST /api/users)."""

    full_name: str = Field(..., min_length=2, max_length=200, description="Full name")
    email: str = Field(..., description="Unique email address")
    role: str = Field(..., description="Either 'client' or 'student'")
    phone: Optional[str] = Field(None, description="Optional phone number")

    @validator("role")
    def validate_role(cls, v: str) -> str:
        if v not in ("client", "student"):
            raise ValueError("role must be 'client' or 'student'")
        return v

    @validator("full_name")
    def strip_name(cls, v: str) -> str:
        return v.strip()

    class Config:
        schema_extra = {
            "example": {
                "full_name": "Anne Hillary",
                "email": "anne@cavendish.ac.ug",
                "role": "student",
                "phone": "+256700000002",
            }
        }


class UserResponse(BaseModel):
    """Shape of a user object returned from the database."""

    id: str
    full_name: str
    email: str
    role: str
    phone: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        orm_mode = True
