/**
 * api.js — The Bridge Protocol
 *
 * Calls the Supabase REST (PostgREST) API directly from the browser.
 * No FastAPI / Vercel backend is required — every table is exposed as a
 * standard REST endpoint by Supabase out of the box.
 *
 * Endpoints used:
 *   GET    /rest/v1/tasks?status=eq.open&select=*       → open tasks
 *   GET    /rest/v1/tasks?select=*                      → all tasks
 *   POST   /rest/v1/tasks                               → create task
 *   PATCH  /rest/v1/tasks?id=eq.<id>                   → update task status
 *   DELETE /rest/v1/tasks?id=eq.<id>                   → delete task
 *   GET    /rest/v1/bids?task_id=eq.<id>&select=*       → bids for a task
 *   GET    /rest/v1/bids?select=*                       → all bids
 *   POST   /rest/v1/bids                                → place a bid
 *   PATCH  /rest/v1/bids?id=eq.<id>                    → update bid status
 *   DELETE /rest/v1/bids?id=eq.<id>                    → delete bid
 *   GET    /rest/v1/users?select=*                      → all users
 *   GET    /rest/v1/users?id=eq.<id>&select=*           → single user
 *   POST   /rest/v1/users                               → register user
 *   POST   /rest/v1/direct_inquiries                    → send reach-out inquiry
 *   GET    /rest/v1/direct_inquiries?task_id=eq.<id>    → inquiries for a task
 */

// ─── Supabase connection ──────────────────────────────────────────────────────

const SUPABASE_URL  = "https://ldrjyiwyevnzoyaymtwb.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxkcmp5aXd5ZXZuem95YXltdHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTEzMzUsImV4cCI6MjEwMDk4NzMzNX0.Gk4i-SaIqdn_VSuB-LszVkHKAHNv4y1Zwgr5gAi4LoU";

/** Build headers required by every Supabase REST request. */
function supabaseHeaders(extra = {}) {
    return {
        "apikey":        SUPABASE_ANON,
        "Authorization": `Bearer ${SUPABASE_ANON}`,
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",   // always return the modified row
        ...extra,
    };
}

// ─── Generic fetch wrapper ────────────────────────────────────────────────────

/**
 * Thin wrapper around fetch that normalises every response into:
 *   { ok: boolean, data: any, status: number, message: string }
 *
 * @param {string} url      Full Supabase REST URL
 * @param {RequestInit} [opts]
 */
async function request(url, opts = {}) {
    try {
        const res = await fetch(url, {
            ...opts,
            headers: { ...supabaseHeaders(), ...(opts.headers || {}) },
        });

        // 204 No Content — success, no body
        if (res.status === 204) {
            return { ok: true, data: null, status: 204, message: "Success" };
        }

        let data;
        try   { data = await res.json(); }
        catch { data = null; }

        if (!res.ok) {
            // PostgREST errors come as { message, hint, details, code }
            const message = (data && (data.message || data.hint)) || `Request failed (${res.status})`;
            return { ok: false, data: null, status: res.status, message };
        }

        return { ok: true, data, status: res.status, message: "OK" };

    } catch (networkError) {
        console.error("[API] Network error:", networkError);
        return {
            ok: false, data: null, status: 0,
            message: "Cannot reach Supabase. Check your internet connection and API key.",
        };
    }
}

/** Shorthand for the Supabase REST table base URL */
const REST = `${SUPABASE_URL}/rest/v1`;


// ─── Tasks ────────────────────────────────────────────────────────────────────

/**
 * Fetch all OPEN tasks (status = open).
 * @returns {Promise<{ok:boolean, data:Task[], message:string}>}
 */
export async function fetchTasks() {
    return request(
        `${REST}/tasks?status=eq.open&select=*&order=created_at.desc`
    );
}

/**
 * Fetch ALL tasks regardless of status (client dashboard).
 * @returns {Promise<{ok:boolean, data:Task[], message:string}>}
 */
export async function fetchAllTasks() {
    return request(
        `${REST}/tasks?select=*&order=created_at.desc`
    );
}

/**
 * Fetch only the tasks posted by a specific client (My Tasks dashboard).
 * @param {string} clientId  - The logged-in user's UUID
 * @returns {Promise<{ok:boolean, data:Task[], message:string}>}
 */
export async function fetchMyTasks(clientId) {
    return request(
        `${REST}/tasks?client_id=eq.${encodeURIComponent(clientId)}&select=*&order=created_at.desc`
    );
}

/**
 * Fetch a single task by ID.
 * @param {string} taskId
 */
export async function fetchTask(taskId) {
    const res = await request(`${REST}/tasks?id=eq.${encodeURIComponent(taskId)}&select=*`);
    // PostgREST returns an array even for a single row; unwrap it
    if (res.ok && Array.isArray(res.data)) {
        res.data = res.data[0] ?? null;
    }
    return res;
}

/**
 * Create a new task.
 * @param {{ title:string, category:string, budget:number, description:string, client_id:string }} payload
 */
export async function createTask(payload) {
    return request(`${REST}/tasks`, {
        method:  "POST",
        body:    JSON.stringify({ ...payload, status: "open" }),
    });
}

/**
 * Update a task's status.
 * @param {string} taskId
 * @param {"open"|"in_progress"|"completed"|"cancelled"} newStatus
 */
export async function updateTaskStatus(taskId, newStatus) {
    return request(
        `${REST}/tasks?id=eq.${encodeURIComponent(taskId)}`,
        { method: "PATCH", body: JSON.stringify({ status: newStatus }) }
    );
}

/**
 * Delete a task.
 * @param {string} taskId
 */
export async function deleteTask(taskId) {
    return request(
        `${REST}/tasks?id=eq.${encodeURIComponent(taskId)}`,
        { method: "DELETE" }
    );
}


// ─── Bids ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all bids, optionally filtered by task ID.
 * @param {string|null} [taskId]
 */
export async function fetchBids(taskId = null) {
    const filter = taskId ? `?task_id=eq.${encodeURIComponent(taskId)}&select=*` : `?select=*`;
    return request(`${REST}/bids${filter}&order=bid_amount.asc`);
}

/**
 * Place a bid on a task.
 * @param {{ task_id:string, student_id:string, bid_amount:number, proposal:string }} payload
 */
export async function placeBid(payload) {
    return request(`${REST}/bids`, {
        method: "POST",
        body:   JSON.stringify({ ...payload, status: "pending" }),
    });
}

/**
 * Accept a bid (sets bid status → accepted, task status → in_progress).
 * Supabase doesn't cascade automatically — we do two PATCHes here.
 * @param {string} bidId
 */
export async function acceptBid(bidId) {
    // 1. Accept the bid
    const res = await request(
        `${REST}/bids?id=eq.${encodeURIComponent(bidId)}`,
        { method: "PATCH", body: JSON.stringify({ status: "accepted" }) }
    );
    if (!res.ok) return res;

    // 2. Move the parent task to in_progress
    //    We need the task_id — it comes back from the PATCH (Prefer: return=representation)
    const bid = Array.isArray(res.data) ? res.data[0] : res.data;
    if (bid?.task_id) {
        await updateTaskStatus(bid.task_id, "in_progress");
    }

    return res;
}

/**
 * Reject a bid.
 * @param {string} bidId
 */
export async function rejectBid(bidId) {
    return request(
        `${REST}/bids?id=eq.${encodeURIComponent(bidId)}`,
        { method: "PATCH", body: JSON.stringify({ status: "rejected" }) }
    );
}

/**
 * Delete a bid.
 * @param {string} bidId
 */
export async function deleteBid(bidId) {
    return request(
        `${REST}/bids?id=eq.${encodeURIComponent(bidId)}`,
        { method: "DELETE" }
    );
}


// ─── Users ────────────────────────────────────────────────────────────────────

/**
 * Fetch all users.
 */
export async function fetchUsers() {
    return request(`${REST}/users?select=*`);
}

/**
 * Fetch a single user by ID.
 * @param {string} userId
 */
export async function fetchUser(userId) {
    const res = await request(`${REST}/users?id=eq.${encodeURIComponent(userId)}&select=*`);
    if (res.ok && Array.isArray(res.data)) {
        res.data = res.data[0] ?? null;
    }
    return res;
}

/**
 * Register a new user.
 * @param {{ full_name:string, email:string, role:"client"|"student", phone?:string }} payload
 */
export async function createUser(payload) {
    return request(`${REST}/users`, {
        method: "POST",
        body:   JSON.stringify(payload),
    });
}


// ─── Direct Inquiries (Improvement 3 — Reach-Out) ────────────────────────────

/**
 * Submit a direct inquiry to the `direct_inquiries` Supabase table.
 *
 * @param {{
 *   task_id:      string,
 *   sender_id:    string,
 *   receiver_id:  string,
 *   subject:      string,
 *   message:      string,
 *   contact_info: string,
 * }} payload
 * @returns {Promise<{ok:boolean, data:any, message:string}>}
 */
export async function submitDirectInquiry(payload) {
    return request(`${REST}/direct_inquiries`, {
        method: "POST",
        body:   JSON.stringify({ ...payload, status: "unread" }),
    });
}

/**
 * Fetch all inquiries for a specific task (client inbox view).
 * @param {string} taskId
 * @returns {Promise<{ok:boolean, data:DirectInquiry[], message:string}>}
 */
export async function fetchInquiriesForTask(taskId) {
    return request(
        `${REST}/direct_inquiries?task_id=eq.${encodeURIComponent(taskId)}&select=*&order=created_at.desc`
    );
}


// ─── Reviews & Ratings (Improvement 5 — Student Rating System) ──────────────

/**
 * Submit a student rating & review.
 * @param {{ task_id:string, reviewer_id:string, reviewee_id:string, rating:number, comment:string }} payload
 */
export function submitReview(payload) {
    return request(`${REST}/reviews`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/**
 * Fetch all reviews received by a specific user.
 * @param {string} userId
 */
export function fetchReviewsForUser(userId) {
    return request(
        `${REST}/reviews?reviewee_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc`
    );
}

/**
 * Fetch all reviews across the platform.
 */
export function fetchAllReviews() {
    return request(`${REST}/reviews?select=*`);
}


// ─── User Lookup (Improvement 6 — In-App Direct Contact) ─────────────────────

/**
 * Fetch a single user's public profile (name, phone, role).
 * @param {string} userId
 */
export function fetchUserById(userId) {
    return request(
        `${REST}/users?id=eq.${encodeURIComponent(userId)}&select=id,full_name,phone,role&limit=1`
    );
}


