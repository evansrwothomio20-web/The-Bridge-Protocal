"""
routers/users.py — User registration and lookup endpoints.
"""

from typing import List
import httpx
from fastapi import APIRouter, HTTPException, status

from app.models.user import UserCreate, UserResponse
from app.database import REST_URL, get_headers
from app.config import settings

router = APIRouter(prefix="/api/users", tags=["Users"])


def _raise_for_status(response: httpx.Response, context: str) -> None:
    if response.is_error:
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=f"{context}: {detail}")


# ---------------------------------------------------------------------------
# GET all users
# ---------------------------------------------------------------------------
@router.get(
    "/",
    response_model=List[UserResponse],
    summary="List all users",
)
def get_users():
    settings.validate()
    try:
        with httpx.Client() as client:
            r = client.get(
                f"{REST_URL}/users",
                headers=get_headers(),
                params={"select": "*", "order": "created_at.desc"},
            )
        _raise_for_status(r, "Failed to fetch users")
        return r.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GET single user by ID
# ---------------------------------------------------------------------------
@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Get a user by ID",
)
def get_user(user_id: str):
    settings.validate()
    try:
        with httpx.Client() as client:
            r = client.get(
                f"{REST_URL}/users",
                headers={**get_headers(), "Accept": "application/vnd.pgrst.object+json"},
                params={"id": f"eq.{user_id}", "select": "*"},
            )
        if r.status_code == 406:
            raise HTTPException(status_code=404, detail=f"User '{user_id}' not found.")
        _raise_for_status(r, "Failed to fetch user")
        return r.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GET all tasks posted by a specific client
# ---------------------------------------------------------------------------
@router.get(
    "/{user_id}/tasks",
    summary="Get all tasks posted by a client",
)
def get_user_tasks(user_id: str):
    settings.validate()
    try:
        with httpx.Client() as client:
            r = client.get(
                f"{REST_URL}/tasks",
                headers=get_headers(),
                params={"client_id": f"eq.{user_id}", "select": "*", "order": "created_at.desc"},
            )
        _raise_for_status(r, "Failed to fetch tasks for user")
        return r.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# GET all bids placed by a specific student
# ---------------------------------------------------------------------------
@router.get(
    "/{user_id}/bids",
    summary="Get all bids placed by a student",
)
def get_user_bids(user_id: str):
    settings.validate()
    try:
        with httpx.Client() as client:
            r = client.get(
                f"{REST_URL}/bids",
                headers=get_headers(),
                params={"student_id": f"eq.{user_id}", "select": "*", "order": "created_at.desc"},
            )
        _raise_for_status(r, "Failed to fetch bids for user")
        return r.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# POST — register a new user
# ---------------------------------------------------------------------------
@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user (client or student)",
)
def create_user(user: UserCreate):
    settings.validate()
    try:
        payload = {
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "phone": user.phone,
        }
        with httpx.Client() as client:
            r = client.post(
                f"{REST_URL}/users",
                headers=get_headers(prefer="return=representation"),
                json=payload,
            )
        _raise_for_status(r, "Failed to create user")
        return {"message": "User registered successfully", "data": r.json()}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# DELETE — remove a user
# ---------------------------------------------------------------------------
@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a user",
)
def delete_user(user_id: str):
    settings.validate()
    try:
        with httpx.Client() as client:
            r = client.delete(
                f"{REST_URL}/users",
                headers=get_headers(),
                params={"id": f"eq.{user_id}"},
            )
        _raise_for_status(r, "Failed to delete user")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
