"""
routers/bids.py — All bid-related API endpoints for The Bridge Protocol.

Students bid on open tasks. Clients can accept or reject bids.
Accepting a bid automatically moves the task to 'in_progress'.
"""

from typing import List
import httpx
from fastapi import APIRouter, HTTPException, status

from app.models.bid import BidCreate, BidResponse
from app.database import REST_URL, get_headers
from app.config import settings

router = APIRouter(prefix="/api/bids", tags=["Bids"])


def _raise_for_status(response: httpx.Response, context: str) -> None:
    if response.is_error:
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=f"{context}: {detail}")


# ---------------------------------------------------------------------------
# GET all bids (optionally filter by task)
# ---------------------------------------------------------------------------
@router.get(
    "/",
    response_model=List[BidResponse],
    summary="List all bids",
    description="Returns all bids. Use `?task_id=<uuid>` to filter by task.",
)
def get_bids(task_id: str = None):
    settings.validate()
    try:
        params = {"select": "*", "order": "created_at.desc"}
        if task_id:
            params["task_id"] = f"eq.{task_id}"
        with httpx.Client() as client:
            r = client.get(f"{REST_URL}/bids", headers=get_headers(), params=params)
        _raise_for_status(r, "Failed to fetch bids")
        return r.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GET single bid by ID
# ---------------------------------------------------------------------------
@router.get(
    "/{bid_id}",
    response_model=BidResponse,
    summary="Get a single bid by ID",
)
def get_bid(bid_id: str):
    settings.validate()
    try:
        with httpx.Client() as client:
            r = client.get(
                f"{REST_URL}/bids",
                headers={**get_headers(), "Accept": "application/vnd.pgrst.object+json"},
                params={"id": f"eq.{bid_id}", "select": "*"},
            )
        if r.status_code == 406:
            raise HTTPException(status_code=404, detail=f"Bid '{bid_id}' not found.")
        _raise_for_status(r, "Failed to fetch bid")
        return r.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# POST — place a new bid on a task
# ---------------------------------------------------------------------------
@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    summary="Place a bid on a task",
    description="A student places a bid on an open task.",
)
def create_bid(bid: BidCreate):
    settings.validate()
    try:
        payload = {
            "task_id": bid.task_id,
            "student_id": bid.student_id,
            "bid_amount": bid.bid_amount,
            "proposal": bid.proposal,
            "status": "pending",
        }
        with httpx.Client() as client:
            r = client.post(
                f"{REST_URL}/bids",
                headers=get_headers(prefer="return=representation"),
                json=payload,
            )
        _raise_for_status(r, "Failed to place bid")
        return {"message": "Bid placed successfully", "data": r.json()}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# PATCH — accept a bid (also moves the task to 'in_progress')
# ---------------------------------------------------------------------------
@router.patch(
    "/{bid_id}/accept",
    summary="Accept a bid",
    description=(
        "Marks this bid as **accepted** and automatically updates "
        "the related task status to **in_progress**."
    ),
)
def accept_bid(bid_id: str):
    settings.validate()
    try:
        with httpx.Client() as client:
            # 1. Accept this bid
            r = client.patch(
                f"{REST_URL}/bids",
                headers=get_headers(prefer="return=representation"),
                params={"id": f"eq.{bid_id}"},
                json={"status": "accepted"},
            )
            _raise_for_status(r, "Failed to accept bid")
            bid_data = r.json()
            if not bid_data:
                raise HTTPException(status_code=404, detail=f"Bid '{bid_id}' not found.")

            # 2. Move the task to in_progress
            task_id = bid_data[0]["task_id"]
            r2 = client.patch(
                f"{REST_URL}/tasks",
                headers=get_headers(),
                params={"id": f"eq.{task_id}"},
                json={"status": "in_progress"},
            )
            _raise_for_status(r2, "Failed to update task status")

        return {
            "message": "Bid accepted and task moved to in_progress",
            "bid": bid_data[0],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# PATCH — reject a bid
# ---------------------------------------------------------------------------
@router.patch(
    "/{bid_id}/reject",
    summary="Reject a bid",
)
def reject_bid(bid_id: str):
    settings.validate()
    try:
        with httpx.Client() as client:
            r = client.patch(
                f"{REST_URL}/bids",
                headers=get_headers(prefer="return=representation"),
                params={"id": f"eq.{bid_id}"},
                json={"status": "rejected"},
            )
        _raise_for_status(r, "Failed to reject bid")
        data = r.json()
        if not data:
            raise HTTPException(status_code=404, detail=f"Bid '{bid_id}' not found.")
        return {"message": "Bid rejected", "data": data}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# DELETE — remove a bid
# ---------------------------------------------------------------------------
@router.delete(
    "/{bid_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a bid",
)
def delete_bid(bid_id: str):
    settings.validate()
    try:
        with httpx.Client() as client:
            r = client.delete(
                f"{REST_URL}/bids",
                headers=get_headers(),
                params={"id": f"eq.{bid_id}"},
            )
        _raise_for_status(r, "Failed to delete bid")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
