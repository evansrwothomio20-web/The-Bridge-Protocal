"""
models/task.py — Pydantic v1 schemas for task-related requests and responses.

Pydantic v1 is 100% pure Python — no Rust compilation required.
Syntax differences from v2:
  - Use @validator instead of @field_validator
  - Use class Config: instead of model_config = {}
  - Use schema_extra instead of json_schema_extra
  - orm_mode = True instead of from_attributes = True
"""

from typing import Optional
from pydantic import BaseModel, Field, validator


class TaskCreate(BaseModel):
    """Payload required to create a new task (POST /api/tasks)."""

    title: str = Field(..., min_length=3, max_length=200, description="Short task title")
    description: str = Field(..., min_length=10, description="Detailed task description")
    category: str = Field(..., min_length=2, max_length=100, description="Task category")
    budget: float = Field(..., gt=0, description="Budget in USD — must be greater than 0")
    client_id: str = Field(..., description="UUID of the client posting the task")

    @validator("title", "category")
    def strip_whitespace(cls, v: str) -> str:
        return v.strip()

    class Config:
        schema_extra = {
            "example": {
                "title": "Build a landing page",
                "description": "I need a responsive landing page built with HTML/CSS.",
                "category": "Web Development",
                "budget": 150.00,
                "client_id": "550e8400-e29b-41d4-a716-446655440000",
            }
        }


class TaskResponse(BaseModel):
    """Shape of a task object returned from the database."""

    id: str
    title: str
    description: str
    category: str
    budget: float
    client_id: str
    status: str
    created_at: Optional[str] = None  # Returned as ISO string from Supabase

    class Config:
        orm_mode = True
