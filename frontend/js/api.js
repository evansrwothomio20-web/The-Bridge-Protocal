/**
 * api.js — The Bridge Protocol
 *
 * Centralized API layer. All HTTP calls to the FastAPI backend live here.
 * Every function returns a typed result object so the UI layer never has to
 * deal with raw Response objects or network errors directly.
 *
 * Backend base: http://127.0.0.1:8000/api
 * Routes used:
 *   GET    /api/tasks                        → list open tasks
 *   GET    /api/tasks/:id                    → single task
 *   POST   /api/tasks                        → create task
 *   PATCH  /api/tasks/:id/status             → update task status
 *   DELETE /api/tasks/:id                    → delete task
 *   GET    /api/bids?task_id=:id             → bids for a task
 *   POST   /api/bids                         → place a bid
 *   PATCH  /api/bids/:id/accept              → accept a bid
 *   PATCH  /api/bids/:id/reject              → reject a bid
 *   GET    /api/users                        → list users
 *   POST   /api/users                        → register a user
 */

const BASE_URL = "http://127.0.0.1:8000/api";

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Generic fetch wrapper.
 * @param {string} path  - Relative path, e.g. "/tasks"
 * @param {RequestInit} [options] - Fetch options (method, body, headers …)
 * @returns {Promise<{ok: boolean, data: any, status: number, message: string}>}
 */
async function request(path, options = {}) {
    const url = `${BASE_URL}${path}`;
    const defaultHeaders = { "Content-Type": "application/json" };

    try {
        const response = await fetch(url, {
            ...options,
            headers: { ...defaultHeaders, ...(options.headers || {}) },
        });

        // 204 No Content — successful but no body
        if (response.status === 204) {
            return { ok: true, data: null, status: 204, message: "Success" };
        }

        let data;
        try {
            data = await response.json();
        } catch {
            data = null;
        }

        if (!response.ok) {
            // FastAPI validation errors come as { detail: string | array }
            const message = extractErrorMessage(data) || `Request failed (${response.status})`;
            return { ok: false, data: null, status: response.status, message };
        }

        return { ok: true, data, status: response.status, message: "OK" };
    } catch (networkError) {
        // Network-level failure (server down, CORS, etc.)
        console.error("[API] Network error:", networkError);
        return {
            ok: false,
            data: null,
            status: 0,
            message: "Cannot reach the server. Make sure the backend is running on port 8000.",
        };
    }
}

/**
 * Pull a readable message from a FastAPI error response body.
 * @param {any} body
 * @returns {string}
 */
function extractErrorMessage(body) {
    if (!body) return "";
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) {
        return body.detail.map((e) => e.msg || JSON.stringify(e)).join("; ");
    }
    if (typeof body.message === "string") return body.message;
    return JSON.stringify(body);
}


// ─── Tasks ────────────────────────────────────────────────────────────────────

/**
 * Fetch all open tasks.
 * @returns {Promise<{ok:boolean, data:Task[], message:string}>}
 */
export async function fetchTasks() {
    return request("/tasks");
}

/**
 * Fetch a single task by ID.
 * @param {string} taskId
 */
export async function fetchTask(taskId) {
    return request(`/tasks/${taskId}`);
}

/**
 * Create a new task.
 * @param {{ title:string, category:string, budget:number, description:string, client_id:string }} payload
 */
export async function createTask(payload) {
    return request("/tasks", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/**
 * Update a task's status.
 * @param {string} taskId
 * @param {"open"|"in_progress"|"completed"|"cancelled"} newStatus
 */
export async function updateTaskStatus(taskId, newStatus) {
    return request(`/tasks/${taskId}/status?new_status=${encodeURIComponent(newStatus)}`, {
        method: "PATCH",
    });
}

/**
 * Delete a task.
 * @param {string} taskId
 */
export async function deleteTask(taskId) {
    return request(`/tasks/${taskId}`, { method: "DELETE" });
}


// ─── Bids ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all bids, optionally filtered by task ID.
 * @param {string} [taskId]
 */
export async function fetchBids(taskId = null) {
    const query = taskId ? `?task_id=${encodeURIComponent(taskId)}` : "";
    return request(`/bids${query}`);
}

/**
 * Place a bid on a task.
 * @param {{ task_id:string, student_id:string, bid_amount:number, proposal:string }} payload
 */
export async function placeBid(payload) {
    return request("/bids", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/**
 * Accept a bid (also moves task → in_progress).
 * @param {string} bidId
 */
export async function acceptBid(bidId) {
    return request(`/bids/${bidId}/accept`, { method: "PATCH" });
}

/**
 * Reject a bid.
 * @param {string} bidId
 */
export async function rejectBid(bidId) {
    return request(`/bids/${bidId}/reject`, { method: "PATCH" });
}

/**
 * Delete a bid.
 * @param {string} bidId
 */
export async function deleteBid(bidId) {
    return request(`/bids/${bidId}`, { method: "DELETE" });
}


// ─── Users ────────────────────────────────────────────────────────────────────

/**
 * Fetch all users.
 */
export async function fetchUsers() {
    return request("/users");
}

/**
 * Fetch a single user by ID.
 * @param {string} userId
 */
export async function fetchUser(userId) {
    return request(`/users/${userId}`);
}

/**
 * Register a new user.
 * @param {{ full_name:string, email:string, role:"client"|"student", phone?:string }} payload
 */
export async function createUser(payload) {
    return request("/users", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}
