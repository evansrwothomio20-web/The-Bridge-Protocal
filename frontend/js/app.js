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
    fetchAllTasks,
    createTask,
    placeBid,
    fetchBids,
    acceptBid,
    rejectBid,
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
    renderMyTasks,
    showBidsPanel,
    closeBidsPanel,
    renderBidsInPanel,
} from "./ui.js";


// ─── State ────────────────────────────────────────────────────────────────────

/** @type {Task[]} Full list of tasks loaded from the API */
let allTasks = [];

/** @type {string} Currently selected category filter */
let activeFilter = "All";

/** @type {"marketplace"|"myTasks"} Active view tab */
let activeView = "marketplace";


// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    wireCharCounter("task-desc", "desc-counter", 500);
    setupEventListeners();
    loadTasks();
});


// ─── Data Loading ─────────────────────────────────────────────────────────────

/**
 * Fetch open tasks from the backend and render them.
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

/**
 * Fetch ALL tasks (any status) and render the My Tasks dashboard.
 */
async function loadMyTasks() {
    showSkeletons(6);

    const { ok, data, message } = await fetchAllTasks();

    if (!ok) {
        showError(message);
        toast("error", "Could not load your tasks", message);
        return;
    }

    const tasks = Array.isArray(data) ? data : [];
    renderMyTasks(tasks, handleViewBids);
}

/**
 * Fetch bids for a task and render them in the bids panel, sorted cheapest-first.
 * @param {Task} task
 */
async function loadBidsForTask(task) {
    renderBidsInPanel(null, task); // show loading state

    const { ok, data, message } = await fetchBids(task.id);

    if (!ok) {
        toast("error", "Could not load bids", message);
        return;
    }

    // Sort bids cheapest → most expensive (best deal first)
    const bids = (Array.isArray(data) ? data : [])
        .sort((a, b) => a.bid_amount - b.bid_amount);

    renderBidsInPanel(bids, task, handleAcceptBid, handleRejectBid);
}


// ─── Event Wiring ─────────────────────────────────────────────────────────────

function setupEventListeners() {
    // ── Navbar: Post Task button
    document.getElementById("open-post-task-btn")
        ?.addEventListener("click", openPostTaskModal);

    // ── Navbar: My Tasks tab
    document.getElementById("my-tasks-tab-btn")
        ?.addEventListener("click", () => switchView("myTasks"));

    // ── Navbar: Marketplace tab
    document.getElementById("marketplace-tab-btn")
        ?.addEventListener("click", () => switchView("marketplace"));

    // ── Refresh button (Marketplace)
    document.getElementById("refresh-btn")
        ?.addEventListener("click", () => {
            if (activeView === "marketplace") {
                activeFilter = "All";
                syncFilterChips();
                loadTasks();
            } else {
                loadMyTasks();
            }
        });

    // ── Refresh button (My Tasks section)
    document.getElementById("refresh-btn-my")
        ?.addEventListener("click", () => loadMyTasks());

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

    // ── Bids Panel — close button
    document.getElementById("close-bids-panel-btn")
        ?.addEventListener("click", closeBidsPanel);

    // ── Bids Panel — backdrop click
    document.getElementById("bids-panel-overlay")
        ?.addEventListener("click", (e) => {
            if (e.target === e.currentTarget) closeBidsPanel();
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

    // ── Global: close modals on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        closePostTaskModal();
        closeBidModal();
        closeBidsPanel();
    });
}

/**
 * Switch between "marketplace" and "myTasks" views.
 * @param {"marketplace"|"myTasks"} view
 */
function switchView(view) {
    activeView = view;

    const marketSection = document.getElementById("tasks-section");
    const myTasksSection = document.getElementById("my-tasks-section");
    const marketBtn = document.getElementById("marketplace-tab-btn");
    const myTasksBtn = document.getElementById("my-tasks-tab-btn");
    const postBtn = document.getElementById("open-post-task-btn");

    if (view === "marketplace") {
        marketSection?.classList.remove("hidden");
        myTasksSection?.classList.add("hidden");
        marketBtn?.classList.add("active");
        myTasksBtn?.classList.remove("active");
        postBtn?.classList.remove("hidden");
        loadTasks();
    } else {
        marketSection?.classList.add("hidden");
        myTasksSection?.classList.remove("hidden");
        marketBtn?.classList.remove("active");
        myTasksBtn?.classList.add("active");
        postBtn?.classList.add("hidden");
        loadMyTasks();
    }
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
 * Called when the user clicks "View Bids" on a task in My Tasks view.
 * @param {Task} task
 */
function handleViewBids(task) {
    showBidsPanel(task);
    loadBidsForTask(task);
}

/**
 * Accept a bid — then refresh the bids panel for the same task.
 * @param {string} bidId
 * @param {Task} task
 */
async function handleAcceptBid(bidId, task) {
    const { ok, message } = await acceptBid(bidId);
    if (ok) {
        toast("success", "Bid Accepted! 🎉", "The task is now in progress.");
        loadBidsForTask(task); // Refresh bids in panel
        loadMyTasks();         // Refresh task list too
    } else {
        toast("error", "Accept Failed", message);
    }
}

/**
 * Reject a bid — then refresh the bids panel.
 * @param {string} bidId
 * @param {Task} task
 */
async function handleRejectBid(bidId, task) {
    const { ok, message } = await rejectBid(bidId);
    if (ok) {
        toast("info", "Bid Rejected", "The bid has been rejected.");
        loadBidsForTask(task);
    } else {
        toast("error", "Reject Failed", message);
    }
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
