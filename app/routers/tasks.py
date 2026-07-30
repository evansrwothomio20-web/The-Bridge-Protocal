"""
routers/tasks.py — All task-related API endpoints for The Bridge Protocol.

Uses httpx directly to call Supabase's PostgREST REST API — no supabase
Python client needed, meaning zero Rust dependencies.
"""

from typing import List
import httpx
from fastapi import APIRouter, HTTPException, status

from app.models.task import TaskCreate, TaskResponse
from app.database import REST_URL, get_headers
from app.config import settings

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


def _raise_for_status(response: httpx.Response, context: str) -> None:
    """Convert a non-2xx Supabase response into a readable HTTPException."""
    if response.is_error:
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise HTTPException(
            status_code=response.status_code,
            detail=f"{context}: {detail}",
        )


@router.get(
    "/",
    response_model=List[TaskResponse],
    summary="List all open tasks",
    description="Returns every task with status **open** from the database.",
)
def get_tasks():
    """Fetch all open tasks from Supabase via REST API."""
    settings.validate()
    try:
        with httpx.Client() as client:
            response = client.get(
                f"{REST_URL}/tasks",
                headers=get_headers(),
                params={"status": "eq.open", "select": "*"},
            )
        _raise_for_status(response, "Failed to fetch tasks")
        return response.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Get a single task by ID",
    description="Looks up one task by its unique ID.",
)
def get_task(task_id: str):
    """Fetch a single task by its ID."""
    settings.validate()
    try:
        with httpx.Client() as client:
            response = client.get(
                f"{REST_URL}/tasks",
                headers={**get_headers(), "Accept": "application/vnd.pgrst.object+json"},
                params={"id": f"eq.{task_id}", "select": "*"},
            )
        if response.status_code == 406:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task with id '{task_id}' not found.",
            )
        _raise_for_status(response, "Failed to fetch task")
        return response.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new task",
    description="Post a new task to the marketplace. Status is automatically set to **open**.",
)
def create_task(task: TaskCreate):
    """Insert a new task into Supabase via REST API."""
    settings.validate()
    try:
        payload = {
            "title": task.title,
            "description": task.description,
            "category": task.category,
            "budget": task.budget,
            "client_id": task.client_id,
            "status": "open",
        }
        with httpx.Client() as client:
            response = client.post(
                f"{REST_URL}/tasks",
                headers=get_headers(prefer="return=representation"),
                json=payload,
            )
        _raise_for_status(response, "Failed to create task")
        return {"message": "Task created successfully", "data": response.json()}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.patch(
    "/{task_id}/status",
    summary="Update a task's status",
    description=(
        "Change the status of a task. "
        "Allowed values: `open`, `in_progress`, `completed`, `cancelled`."
    ),
)
def update_task_status(task_id: str, new_status: str):
    """Update the status field of an existing task."""
    allowed = {"open", "in_progress", "completed", "cancelled"}
    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{new_status}'. Must be one of: {sorted(allowed)}",
        )
    settings.validate()
    try:
        with httpx.Client() as client:
            response = client.patch(
                f"{REST_URL}/tasks",
                headers=get_headers(prefer="return=representation"),
                params={"id": f"eq.{task_id}"},
                json={"status": new_status},
            )
        _raise_for_status(response, "Failed to update task")
        data = response.json()
        if not data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task with id '{task_id}' not found.",
            )
        return {"message": f"Task status updated to '{new_status}'", "data": data}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a task",
    description="Permanently removes a task from the database.",
)
def delete_task(task_id: str):
    """Delete a task by ID."""
    settings.validate()
    try:
        with httpx.Client() as client:
            response = client.delete(
                f"{REST_URL}/tasks",
                headers=get_headers(),
                params={"id": f"eq.{task_id}"},
            )
        _raise_for_status(response, "Failed to delete task")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
