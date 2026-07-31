"""
models/bid.py — Pydantic v1 schemas for bid-related requests and responses.
"""

from typing import Optional
from pydantic import BaseModel, Field


class BidCreate(BaseModel):
    """Payload required to place a bid on a task (POST /api/bids)."""

    task_id: str = Field(..., description="UUID of the task being bid on")
    student_id: str = Field(..., description="UUID of the student placing the bid")
    bid_amount: float = Field(..., gt=0, description="Proposed amount in UGX — must be greater than 0")
    proposal: str = Field(..., min_length=10, description="Explanation of how the student will complete the task")

    class Config:
        schema_extra = {
            "example": {
                "task_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                "student_id": "22222222-2222-2222-2222-222222222222",
                "bid_amount": 20000.00,
                "proposal": "I have 2 years of experience in tech repair and can fix this within 24 hours.",
            }
        }


class BidResponse(BaseModel):
    """Shape of a bid object returned from the database."""

    id: str
    task_id: str
    student_id: str
    bid_amount: float
    proposal: str
    status: str  # 'pending', 'accepted', 'rejected'
    created_at: Optional[str] = None

    class Config:
        orm_mode = True
