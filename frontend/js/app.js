/**
 * app.js — The Bridge Protocol
 *
 * Entry point. Bootstraps the application on DOMContentLoaded:
 *   1. Wires all event listeners (modals, forms, filter chips, refresh)
 *   2. Fetches initial task data from the backend
 *   3. Delegates rendering to ui.js and data fetching to api.js
 *
 * Import chain:
 *   app.js  →  api.js   (data)
 *   app.js  →  ui.js    (rendering)
 */

import {
    fetchTasks,
    createTask,
    placeBid,
} from "./api.js";

import {
    showSkeletons,
    showError,
    renderTasks,
    openBidModal,
    closeBidModal,
    openPostTaskModal,
    closePostTaskModal,
    toast,
    setButtonLoading,
    wireCharCounter,
} from "./ui.js";


// ─── State ────────────────────────────────────────────────────────────────────

/** @type {Task[]} Full list of tasks loaded from the API */
let allTasks = [];

/** @type {string} Currently selected category filter */
let activeFilter = "All";


// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    wireCharCounter("task-desc", "desc-counter", 500);
    setupEventListeners();
    loadTasks();
});


// ─── Data Loading ─────────────────────────────────────────────────────────────

/**
 * Fetch tasks from the backend and render them.
 * Shows skeleton cards while loading, error state on failure.
 */
async function loadTasks() {
    showSkeletons(6);

    const { ok, data, message } = await fetchTasks();

    if (!ok) {
        showError(message);
        toast("error", "Could not load tasks", message);
        return;
    }

    allTasks = Array.isArray(data) ? data : [];
    renderTasks(allTasks, activeFilter, handleBidClick);
}


// ─── Event Wiring ─────────────────────────────────────────────────────────────

function setupEventListeners() {
    // ── Navbar: Post Task button
    document.getElementById("open-post-task-btn")
        ?.addEventListener("click", openPostTaskModal);

    // ── Refresh button
    document.getElementById("refresh-btn")
        ?.addEventListener("click", () => {
            activeFilter = "All";
            syncFilterChips();
            loadTasks();
        });

    // ── Post Task modal — close buttons
    document.getElementById("close-post-task-btn")
        ?.addEventListener("click", closePostTaskModal);
    document.getElementById("cancel-post-task-btn")
        ?.addEventListener("click", closePostTaskModal);

    // ── Post Task modal — backdrop click
    document.getElementById("post-task-modal")
        ?.addEventListener("click", (e) => {
            if (e.target === e.currentTarget) closePostTaskModal();
        });

    // ── Bid modal — close buttons
    document.getElementById("close-bid-btn")
        ?.addEventListener("click", closeBidModal);
    document.getElementById("cancel-bid-btn")
        ?.addEventListener("click", closeBidModal);

    // ── Bid modal — backdrop click
    document.getElementById("bid-modal")
        ?.addEventListener("click", (e) => {
            if (e.target === e.currentTarget) closeBidModal();
        });

    // ── Category filter chips
    document.getElementById("filter-bar")
        ?.addEventListener("click", (e) => {
            const chip = e.target.closest(".filter-chip");
            if (!chip) return;
            activeFilter = chip.dataset.category || "All";
            syncFilterChips();
            renderTasks(allTasks, activeFilter, handleBidClick);
        });

    // ── Create Task form submission
    document.getElementById("create-task-form")
        ?.addEventListener("submit", handleCreateTask);

    // ── Place Bid form submission
    document.getElementById("place-bid-form")
        ?.addEventListener("submit", handlePlaceBid);

    // ── Global: close modal on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        closePostTaskModal();
        closeBidModal();
    });
}

/**
 * Sync the active-class on filter chips to match `activeFilter`.
 */
function syncFilterChips() {
    document.querySelectorAll(".filter-chip").forEach((chip) => {
        chip.classList.toggle("active", chip.dataset.category === activeFilter);
    });
}


// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * Called when the user clicks "Apply / Bid" on a task card.
 * @param {Task} task
 */
function handleBidClick(task) {
    openBidModal(task);
}

/**
 * Handle the "Post Task" form submit.
 * @param {SubmitEvent} e
 */
async function handleCreateTask(e) {
    e.preventDefault();

    const submitBtn = document.getElementById("submit-task-btn");
    setButtonLoading(submitBtn, true);

    const title       = document.getElementById("task-title").value.trim();
    const category    = document.getElementById("task-category").value;
    const budget      = parseFloat(document.getElementById("task-budget").value);
    const description = document.getElementById("task-desc").value.trim();
    const client_id   = document.getElementById("task-client-id").value;

    // Simple client-side guard
    if (!title || !category || !budget || !description) {
        toast("error", "Missing Fields", "Please fill in all required fields.");
        setButtonLoading(submitBtn, false);
        return;
    }

    const { ok, message } = await createTask({
        title,
        category,
        budget,
        description,
        client_id,
    });

    setButtonLoading(submitBtn, false);

    if (ok) {
        closePostTaskModal();
        toast("success", "Task Posted! 🎉", "Your task is now live on the marketplace.");
        // Reload task list to include the new task
        await loadTasks();
    } else {
        toast("error", "Failed to Post Task", message);
    }
}

/**
 * Handle the "Place Bid" form submit.
 * @param {SubmitEvent} e
 */
async function handlePlaceBid(e) {
    e.preventDefault();

    const submitBtn = document.getElementById("submit-bid-btn");
    setButtonLoading(submitBtn, true);

    const task_id    = document.getElementById("bid-task-id").value;
    const student_id = document.getElementById("bid-student-id").value;
    const bid_amount = parseFloat(document.getElementById("bid-amount").value);
    const proposal   = document.getElementById("bid-proposal").value.trim();

    if (!task_id || !student_id || !bid_amount || !proposal) {
        toast("error", "Missing Fields", "Please fill in all required fields.");
        setButtonLoading(submitBtn, false);
        return;
    }

    const { ok, message } = await placeBid({
        task_id,
        student_id,
        bid_amount,
        proposal,
    });

    setButtonLoading(submitBtn, false);

    if (ok) {
        closeBidModal();
        toast("success", "Bid Submitted! ✅", "Your proposal has been sent to the client.");
    } else {
        toast("error", "Bid Failed", message);
    }
}
