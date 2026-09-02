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
    fetchMyTasks,
    createTask,
    placeBid,
    fetchBids,
    acceptBid,
    rejectBid,
    submitDirectInquiry,
    updateTaskStatus,
    submitReview,
    fetchAllReviews,
    fetchUserById,
    fetchUser,
    createUser,
} from "./api.js";

import {
    showSkeletons,
    showError,
    renderTasks,
    openBidModal,
    closeBidModal,
    openPostTaskModal,
    closePostTaskModal,
    openTaskDetailModal,
    closeTaskDetailModal,
    toast,
    setButtonLoading,
    wireCharCounter,
    renderMyTasks,
    showBidsPanel,
    closeBidsPanel,
    renderBidsInPanel,
    openReachoutModal,
    closeReachoutModal,
    showReachoutSuccess,
    wireReachoutCharCounter,
    renderTaskStepper,
    openReviewModal,
    closeReviewModal,
    initStarRatingWidget,
    renderStudentRatingBadge,
    renderContactBox,
} from "./ui.js";

import { getSession, getCurrentUser, logout } from "./auth.js";


// ─── State ───────────────────────────────────────────────────────────────────────────────

/** @type {Task[]} Full list of tasks loaded from the API */
let allTasks = [];

/** @type {string} Currently selected category filter */
let activeFilter = "All";

/** @type {"marketplace"|"myTasks"} Active view tab */
let activeView = "marketplace";

/** @type {Review[]} Cache of reviews for calculating student rating badges */
let allReviews = [];

/** @type {string} UUID of the currently logged-in user (from Supabase session) */
let currentUserId = "";

/** @type {string} Role of the logged-in user: "client" | "student" */
let currentUserRole = "";


// ─── Bootstrap ─────────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
    wireCharCounter("task-desc", "desc-counter", 500);
    wireCharCounter("review-comment", "review-msg-counter", 500);
    wireReachoutCharCounter();
    setupEventListeners();
    await initSession();  // must run before any data loads
    loadReviews();
    loadTasks();
});


// ─── Session Initialisation ──────────────────────────────────────────────────────────────

/**
 * Fetch the active Supabase session, resolve the user's public profile,
 * then inject IDs into all hidden form fields and populate the user chip.
 * This must be called before any API writes (task creation, bid placement).
 */
async function initSession() {
    const session = await getSession();
    if (!session) return; // not logged in — requireAuth() will redirect

    currentUserId = session.user.id;

    // Inject into hidden fields for Post Task and Place Bid modals
    injectUserId(currentUserId);

    // Fetch the public users table row for role + full_name
    const { ok, data } = await fetchUser(currentUserId);
    if (ok && data) {
        currentUserRole = data.role || "";
        populateUserChip(data.full_name || session.user.email, data.role || "");
    } else {
        // Profile row is missing — this happens when email confirmation is
        // enabled and the public.users insert failed silently at sign-up.
        // Recover by upserting the row now, using the auth session metadata.
        console.warn("[app] Public profile row missing — attempting to create it now.");
        await upsertPublicProfile(session);
        // Re-fetch to populate the chip with the correct name/role
        const retry = await fetchUser(currentUserId);
        if (retry.ok && retry.data) {
            currentUserRole = retry.data.role || "";
            populateUserChip(retry.data.full_name || session.user.email, retry.data.role || "");
        }
    }
}

/**
 * Safety-net: create a public users row for the current auth user if it is
 * missing. Uses the raw_user_meta_data stored in the auth session at sign-up.
 * @param {import("@supabase/supabase-js").Session} session
 */
async function upsertPublicProfile(session) {
    const user  = session.user;
    const meta  = user.user_metadata || {};
    const payload = {
        id:        user.id,
        full_name: meta.full_name || user.email,
        email:     user.email,
        role:      meta.role || "client",   // default to client if not stored
    };
    const { ok, message } = await createUser(payload);
    if (!ok) {
        console.error("[app] upsertPublicProfile failed:", message);
    } else {
        console.info("[app] Public profile row created successfully.");
    }
}

/**
 * Inject the logged-in user's UUID into every hidden ID field across all forms.
 * @param {string} userId
 */
function injectUserId(userId) {
    // Post Task form
    const clientIdEl = document.getElementById("task-client-id");
    if (clientIdEl) clientIdEl.value = userId;

    // Place Bid modal
    const bidStudentEl = document.getElementById("bid-student-id");
    if (bidStudentEl) bidStudentEl.value = userId;

    // Task Detail inline bid form
    const tdStudentEl = document.getElementById("td-bid-student-id");
    if (tdStudentEl) tdStudentEl.value = userId;

    // Reach-Out modal sender
    const senderEl = document.getElementById("reachout-sender-id");
    if (senderEl) senderEl.value = userId;
}

/**
 * Populate the user chip in the navbar with name and role.
 * @param {string} name
 * @param {string} role
 */
function populateUserChip(name, role) {
    const chip = document.getElementById("user-chip");
    if (chip) chip.classList.remove("hidden");

    const avatarEl = document.getElementById("user-avatar");
    if (avatarEl) {
        const initials = name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
        avatarEl.textContent = initials || "?";
    }

    const nameEl = document.getElementById("user-chip-name");
    if (nameEl) nameEl.textContent = name;

    const roleEl = document.getElementById("user-chip-role");
    if (roleEl) roleEl.textContent = role ? (role === "client" ? "🏢 Client" : "🎓 Student") : "";
}


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
 * Filtered by the current logged-in user's ID so only their tasks appear.
 */
async function loadMyTasks() {
    showSkeletons(6);

    if (!currentUserId) {
        showError("You must be logged in to view your tasks.");
        return;
    }

    const { ok, data, message } = await fetchMyTasks(currentUserId);

    if (!ok) {
        showError(message);
        toast("error", "Could not load your tasks", message);
        return;
    }

    const tasks = Array.isArray(data) ? data : [];
    renderMyTasks(tasks, handleViewBids);
}

/**
 * Fetch all student reviews from Supabase.
 */
async function loadReviews() {
    const { ok, data } = await fetchAllReviews();
    if (ok && Array.isArray(data)) {
        allReviews = data;
    } else {
        allReviews = [];
    }
}

/**
 * Fetch bids for a task and render them in the bids panel, sorted cheapest-first.
 * After fetching, also resolves the accepted student contact info (Improvement 6).
 * @param {Task} task
 */
async function loadBidsForTask(task) {
    renderBidsInPanel(null, task, handleAcceptBid, handleRejectBid, handleWorkSubmitted, handleWorkCompleted, handleLeaveReview, allReviews); // show loading state
    renderContactBox(null, task.status); // show loading skeleton if unlocked

    const { ok, data, message } = await fetchBids(task.id);

    if (!ok) {
        toast("error", "Could not load bids", message);
        return;
    }

    // Sort bids cheapest → most expensive (best deal first)
    const bids = (Array.isArray(data) ? data : [])
        .sort((a, b) => a.bid_amount - b.bid_amount);

    renderBidsInPanel(bids, task, handleAcceptBid, handleRejectBid, handleWorkSubmitted, handleWorkCompleted, handleLeaveReview, allReviews);

    // Improvement 6: reveal accepted student contact if task is assigned/in_progress/etc.
    await loadContactForTask(task, bids);
}


// ─── Event Wiring ─────────────────────────────────────────────────────────────

/**
 * Resolve the accepted student's contact info and render the contact box.
 * Only reveals details once a bid has been accepted (status != open).
 * @param {Task} task
 * @param {Bid[]} bids
 */
async function loadContactForTask(task, bids) {
    const UNLOCKED = ["assigned", "in_progress", "submitted", "completed"];
    if (!UNLOCKED.includes(task.status)) {
        // Show privacy shield — status is still 'open'
        renderContactBox(undefined, task.status);
        return;
    }

    // Find the accepted bid to get the student ID
    const acceptedBid = bids.find(b => b.status === "accepted");
    const studentId = acceptedBid?.student_id;

    if (!studentId) {
        // Assigned but no accepted bid found (edge case)
        renderContactBox(undefined, task.status);
        return;
    }

    // Fetch student user profile
    const { ok, data } = await fetchUserById(studentId);
    if (ok && Array.isArray(data) && data.length > 0) {
        renderContactBox(data[0], task.status);
    } else {
        renderContactBox(undefined, task.status);
    }
}

function setupEventListeners() {
    // ── Navbar: Post Task button
    document.getElementById("open-post-task-btn")
        ?.addEventListener("click", openPostTaskModal);

    // ── Navbar: Logout button
    document.getElementById("logout-btn")
        ?.addEventListener("click", logout);

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

    // ── Task Detail modal — close buttons
    document.getElementById("close-task-detail-btn")
        ?.addEventListener("click", closeTaskDetailModal);
    document.getElementById("cancel-td-bid-btn")
        ?.addEventListener("click", closeTaskDetailModal);

    // ── Task Detail modal — backdrop click
    document.getElementById("task-detail-modal")
        ?.addEventListener("click", (e) => {
            if (e.target === e.currentTarget) closeTaskDetailModal();
        });

    // ── Task Detail inline bid form submission
    document.getElementById("td-bid-form")
        ?.addEventListener("submit", handlePlaceBidFromDetail);

    // ── Global: close modals on Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        closePostTaskModal();
        closeBidModal();
        closeTaskDetailModal();
        closeBidsPanel();
        closeReachoutModal();
        closeReviewModal();
    });

    // ── Reach-Out modal — close buttons
    document.getElementById("close-reachout-btn")
        ?.addEventListener("click", closeReachoutModal);
    document.getElementById("cancel-reachout-btn")
        ?.addEventListener("click", closeReachoutModal);
    document.getElementById("reachout-done-btn")
        ?.addEventListener("click", closeReachoutModal);

    // ── Reach-Out modal — backdrop click
    document.getElementById("reachout-modal")
        ?.addEventListener("click", (e) => {
            if (e.target === e.currentTarget) closeReachoutModal();
        });

    // ── Reach-Out form submission
    document.getElementById("reachout-form")
        ?.addEventListener("submit", handleReachoutSubmit);

    // ── Review modal — close buttons
    document.getElementById("close-review-btn")
        ?.addEventListener("click", closeReviewModal);
    document.getElementById("cancel-review-btn")
        ?.addEventListener("click", closeReviewModal);

    // ── Review modal — backdrop click
    document.getElementById("review-modal")
        ?.addEventListener("click", (e) => {
            if (e.target === e.currentTarget) closeReviewModal();
        });

    // ── Review form submission
    document.getElementById("create-review-form")
        ?.addEventListener("submit", handleReviewSubmit);
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


// ─── Reach-Out / Direct Inquiry ───────────────────────────────────────────────

/**
 * Handle the Reach-Out form submission — validates, calls Supabase,
 * then shows the animated success state or an error toast.
 * @param {SubmitEvent} e
 */
async function handleReachoutSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById("submit-reachout-btn");
    setButtonLoading(submitBtn, true);

    const task_id      = document.getElementById("reachout-task-id").value;
    const sender_id    = document.getElementById("reachout-sender-id").value;
    const receiver_id  = document.getElementById("reachout-receiver-id").value;
    const subject      = document.getElementById("reachout-subject").value.trim();
    const message      = document.getElementById("reachout-message").value.trim();
    const contact_info = document.getElementById("reachout-contact").value.trim();

    // Client-side guards
    if (!subject || subject.length < 5) {
        toast("error", "Subject too short", "Please enter a subject of at least 5 characters.");
        setButtonLoading(submitBtn, false);
        return;
    }
    if (!message || message.length < 20) {
        toast("error", "Message too short", "Please write at least 20 characters in your message.");
        setButtonLoading(submitBtn, false);
        return;
    }
    if (!contact_info || contact_info.length < 7) {
        toast("error", "Contact info required", "Please provide a valid phone or WhatsApp number.");
        setButtonLoading(submitBtn, false);
        return;
    }

    const { ok, message: errMsg } = await submitDirectInquiry({
        task_id,
        sender_id,
        receiver_id,
        subject,
        message,
        contact_info,
    });

    setButtonLoading(submitBtn, false);

    if (ok) {
        // Show the animated success view inside the modal
        showReachoutSuccess();
    } else {
        toast("error", "Inquiry Failed", errMsg || "Could not send your message. Please try again.");
    }
}

/**
 * Called when the user clicks "View Bids" on a task in My Tasks view.
 * @param {Task} task
 */
function handleViewBids(task) {
    showBidsPanel(task, handleWorkSubmitted, handleWorkCompleted, handleLeaveReview);
    loadBidsForTask(task);
}

/**
 * Accept a bid — then refresh the bids panel for the same task.
 * Updates task status to 'in_progress'.
 * @param {string} bidId
 * @param {Task} task
 */
async function handleAcceptBid(bidId, task) {
    const { ok, message } = await acceptBid(bidId);
    if (ok) {
        toast("success", "Bid Accepted! 🎉", "Task is now in progress.");
        task.status = "in_progress";
        await loadBidsForTask(task); // Refresh bids in panel
        loadMyTasks();               // Refresh task list too
    } else {
        toast("error", "Accept Failed", message);
    }
}

/**
 * Student / Freelancer marks assigned work as submitted.
 * Transitions status: assigned / in_progress → submitted
 * @param {Task} task
 */
async function handleWorkSubmitted(task) {
    const { ok, message } = await updateTaskStatus(task.id, "submitted");
    if (ok) {
        toast("success", "Work Submitted! 📤", "Your work has been submitted for client review.");
        task.status = "submitted";
        await loadBidsForTask(task);
        if (activeView === "marketplace") loadTasks();
        else loadMyTasks();
    } else {
        toast("error", "Submission Failed", message);
    }
}

/**
 * Client approves and completes a submitted task.
 * Transitions status: submitted → completed, then opens review prompt.
 * @param {Task} task
 */
async function handleWorkCompleted(task) {
    const { ok, message } = await updateTaskStatus(task.id, "completed");
    if (ok) {
        toast("success", "Task Completed! 🎉", "Work approved! Please leave a review for the student.");
        task.status = "completed";
        await loadBidsForTask(task);
        if (activeView === "marketplace") loadTasks();
        else loadMyTasks();
        handleLeaveReview(task); // prompt review modal immediately
    } else {
        toast("error", "Approval Failed", message);
    }
}

/**
 * Opens the review modal for a completed task.
 * Finds the accepted bid to get the student_id being reviewed.
 * @param {Task} task
 */
async function handleLeaveReview(task) {
    let studentId = "22222222-2222-2222-2222-222222222222"; // default test student
    const { ok, data } = await fetchBids(task.id);
    if (ok && Array.isArray(data)) {
        const accepted = data.find(b => b.status === "accepted");
        if (accepted?.student_id) {
            studentId = accepted.student_id;
        }
    }
    openReviewModal(task, studentId);
}

/**
 * Handle submission of the review modal form.
 * @param {SubmitEvent} e
 */
async function handleReviewSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById("submit-review-btn");
    setButtonLoading(submitBtn, true);

    const task_id     = document.getElementById("review-task-id").value;
    const reviewer_id = document.getElementById("review-reviewer-id").value;
    const reviewee_id = document.getElementById("review-reviewee-id").value;
    const rating      = parseInt(document.getElementById("review-rating-value").value, 10) || 5;
    const comment     = document.getElementById("review-comment").value.trim();

    if (!comment || comment.length < 3) {
        toast("error", "Comment Required", "Please write a brief comment describing your experience.");
        setButtonLoading(submitBtn, false);
        return;
    }

    const { ok, message } = await submitReview({
        task_id,
        reviewer_id,
        reviewee_id,
        rating,
        comment,
    });

    setButtonLoading(submitBtn, false);

    if (ok) {
        closeReviewModal();
        toast("success", "Review Published! ⭐", "Thank you for rating this student's work.");
        await loadReviews(); // refresh reviews cache
        const task = allTasks.find(t => t.id === task_id);
        if (task) loadBidsForTask(task);
    } else {
        toast("error", "Review Failed", message);
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

    if (proposal.length < 5) {
        toast("error", "Proposal Too Short", "Your proposal must be at least 5 characters.");
        setButtonLoading(submitBtn, false);
        return;
    }

    if (bid_amount <= 0) {
        toast("error", "Invalid Amount", "Bid amount must be greater than 0.");
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

/**
 * Handle the inline "Submit Bid" form inside the Task Detail modal (#td-bid-form).
 * Reads from td-prefixed fields and closes the detail modal on success.
 * @param {SubmitEvent} e
 */
async function handlePlaceBidFromDetail(e) {
    e.preventDefault();

    const submitBtn = document.getElementById("submit-td-bid-btn");
    setButtonLoading(submitBtn, true);

    const task_id    = document.getElementById("td-bid-task-id").value;
    const student_id = document.getElementById("td-bid-student-id").value;
    const bid_amount = parseFloat(document.getElementById("td-bid-amount").value);
    const proposal   = document.getElementById("td-bid-proposal").value.trim();

    if (!task_id || !student_id || !bid_amount || !proposal) {
        toast("error", "Missing Fields", "Please fill in all required fields.");
        setButtonLoading(submitBtn, false);
        return;
    }

    if (proposal.length < 5) {
        toast("error", "Proposal Too Short", "Your proposal must be at least 5 characters.");
        setButtonLoading(submitBtn, false);
        return;
    }

    if (bid_amount <= 0) {
        toast("error", "Invalid Amount", "Bid amount must be greater than 0.");
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
        closeTaskDetailModal();
        toast("success", "Bid Submitted! ✅", "Your proposal has been sent to the client.");
    } else {
        toast("error", "Bid Failed", message);
    }
}
