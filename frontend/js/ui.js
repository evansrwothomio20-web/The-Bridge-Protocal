/**
 * ui.js — The Bridge Protocol
 *
 * All DOM rendering logic lives here:
 *   - renderTasks()       → builds the task grid
 *   - showSkeletons()     → animated placeholder cards while loading
 *   - showError()         → renders the error state in the grid
 *   - showEmpty()         → renders the empty state in the grid
 *   - openBidModal()      → populates and shows the bid modal
 *   - toast()             → fires a toast notification
 *   - setButtonLoading()  → toggles spinner on submit buttons
 *
 * This file exports functions; it does NOT import from api.js.
 * app.js wires the two together.
 */

// ─── XSS protection ──────────────────────────────────────────────────────────

/**
 * Escape user-supplied strings before inserting into innerHTML.
 * @param {string|number|null|undefined} str
 * @returns {string}
 */
function esc(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;");
}


// ─── Category helpers ─────────────────────────────────────────────────────────

const CATEGORY_CSS = {
    "Tech Repair":       "cat--tech-repair",
    "Tutoring":          "cat--tutoring",
    "Graphic Design":    "cat--graphic-design",
    "Campus Logistics":  "cat--campus-logistics",
    "Other":             "cat--other",
};

const CATEGORY_EMOJI = {
    "Tech Repair":       "🔧",
    "Tutoring":          "📚",
    "Graphic Design":    "🎨",
    "Campus Logistics":  "🏫",
    "Other":             "⚙️",
};

/**
 * @param {string} category
 * @returns {string} CSS class name
 */
function catClass(category) {
    return CATEGORY_CSS[category] || "cat--other";
}

/**
 * @param {string} category
 * @returns {string} emoji prefix
 */
function catEmoji(category) {
    return CATEGORY_EMOJI[category] || "⚙️";
}


// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CSS = {
    open:        "status--open",
    assigned:    "status--assigned",
    in_progress: "status--in-progress",
    submitted:   "status--submitted",
    completed:   "status--completed",
    cancelled:   "status--cancelled",
};

const STATUS_LABEL = {
    open:        "Open",
    assigned:    "Assigned",
    in_progress: "In Progress",
    submitted:   "Work Submitted",
    completed:   "Completed",
    cancelled:   "Cancelled",
};

/**
 * @param {string} status
 * @returns {string} HTML for the status badge
 */
export function statusBadgeHtml(status) {
    const cls   = STATUS_CSS[status]   || "status--open";
    const label = STATUS_LABEL[status] || status;
    return `<span class="status-badge ${cls}"><span class="status-dot" aria-hidden="true"></span>${esc(label)}</span>`;
}


// ─── Currency formatter ───────────────────────────────────────────────────────

const UGX = new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0,
});

/**
 * @param {number} amount
 * @returns {string} e.g. "UGX 25,000"
 */
function formatUGX(amount) {
    return UGX.format(amount);
}


// ─── Date formatter ───────────────────────────────────────────────────────────

/**
 * @param {string} isoString
 * @returns {string} e.g. "2 Aug 2026"
 */
function formatDate(isoString) {
    if (!isoString) return "";
    return new Date(isoString).toLocaleDateString("en-UG", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}


// ─── Skeleton cards ───────────────────────────────────────────────────────────

/**
 * Render N animated skeleton placeholder cards into the task grid.
 * @param {number} [count=6]
 */
export function showSkeletons(count = 6) {
    const container = document.getElementById("tasks-container");
    if (!container) return;

    container.innerHTML = Array.from({ length: count }, () => `
        <div class="skeleton-card" aria-hidden="true">
            <div class="skeleton-line skeleton-tag"></div>
            <div class="skeleton-line skeleton-title" style="margin-top:8px"></div>
            <div class="skeleton-line skeleton-desc" style="margin-top:14px"></div>
            <div class="skeleton-line skeleton-desc-2" style="margin-top:6px"></div>
            <div class="skeleton-line skeleton-budget" style="margin-top:18px"></div>
        </div>
    `).join("");
}


// ─── Error state ──────────────────────────────────────────────────────────────

/**
 * Show an error message in the task grid area.
 * @param {string} message
 */
export function showError(message) {
    const container = document.getElementById("tasks-container");
    if (!container) return;

    const isLocal = window.location.hostname === "localhost" ||
                    window.location.hostname === "127.0.0.1";

    const hint = isLocal
        ? `Ensure the backend is running:<br><code>uvicorn main:app --reload</code>`
        : `Backend API call failed. Check that <code>SUPABASE_URL</code> and <code>SUPABASE_KEY</code> are set in your Vercel project's Environment Variables, then redeploy.`;

    container.innerHTML = `
        <div class="error-state" role="alert">
            <h4>⚠️ Could Not Load Tasks</h4>
            <p>${esc(message)}</p>
            <p style="margin-top:8px">${hint}</p>
        </div>
    `;
}


// ─── Empty state ──────────────────────────────────────────────────────────────

/**
 * Show an empty state message in the task grid area.
 * @param {string} [category] - If filtered, name of the category
 */
export function showEmpty(category = null) {
    const container = document.getElementById("tasks-container");
    if (!container) return;

    const msg = category && category !== "All"
        ? `No open tasks in <strong>${esc(category)}</strong> right now.`
        : "No open tasks at the moment. Be the first to post one!";

    container.innerHTML = `
        <div class="empty-state" role="status">
            <div class="empty-state-icon">🏗️</div>
            <h4>Nothing Here Yet</h4>
            <p>${msg}</p>
        </div>
    `;
}


// ─── Task cards ───────────────────────────────────────────────────────────────

/**
 * Render an array of task objects into the task grid.
 * Replaces all current content. Applies filter if provided.
 *
 * @param {Task[]} tasks         - Full list from the API
 * @param {string} [filter="All"] - Category filter
 * @param {Function} onBid       - Callback when "Apply / Bid" is clicked (task) => void
 */
export function renderTasks(tasks, filter = "All", onBid) {
    const container = document.getElementById("tasks-container");
    if (!container) return;

    // Apply category filter
    const visible = filter === "All"
        ? tasks
        : tasks.filter((t) => t.category === filter);

    // Update stats counter in hero
    const statEl = document.getElementById("stat-tasks-count");
    if (statEl) statEl.textContent = tasks.length;

    if (visible.length === 0) {
        showEmpty(filter);
        return;
    }

    container.innerHTML = "";

    visible.forEach((task) => {
        const card = buildTaskCard(task, onBid);
        container.appendChild(card);
    });
}

/**
 * Build a single task card element.
 * @param {Task} task
 * @param {Function} onBid
 * @returns {HTMLElement}
 */
function buildTaskCard(task, onBid) {
    const card = document.createElement("div");
    card.className = "task-card";
    card.setAttribute("role", "listitem");
    card.dataset.taskId = task.id;

    card.innerHTML = `
        <div class="card-top">
            <div class="card-body">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
                    <span class="category-tag ${catClass(task.category)}">
                        ${catEmoji(task.category)} ${esc(task.category)}
                    </span>
                    ${statusBadgeHtml(task.status)}
                </div>
                <h4 class="task-card-title">${esc(task.title)}</h4>
                <p class="task-card-desc">${esc(task.description)}</p>
            </div>
        </div>
        <div class="card-footer">
            <div class="card-meta">
                <span class="task-budget">${formatUGX(task.budget)}</span>
                ${task.created_at ? `<span class="task-date">Posted ${formatDate(task.created_at)}</span>` : ""}
            </div>
            <div class="card-footer-actions">
                <button
                    class="btn btn-ghost btn-details"
                    data-task-id="${esc(task.id)}"
                    aria-label="View details of ${esc(task.title)}"
                    title="View full task details"
                >
                    🔍 Details
                </button>
                <button
                    class="btn btn-primary apply-btn"
                    data-task-id="${esc(task.id)}"
                    aria-label="Apply or bid on ${esc(task.title)}"
                    ${task.status !== "open" ? "disabled" : ""}
                >
                    ${task.status === "open" ? "Apply / Bid" : "Closed"}
                </button>
                ${task.status === "open" ? `
                <button
                    class="btn-reach-ghost reach-btn"
                    data-task-id="${esc(task.id)}"
                    aria-label="Reach out directly about ${esc(task.title)}"
                    title="Send a direct message to the requester"
                >
                    💬 Reach Out
                </button>
                ` : ""}
            </div>
        </div>
    `;

    // Attach bid button handler
    const applyBtn = card.querySelector(".apply-btn");
    if (applyBtn && task.status === "open") {
        applyBtn.addEventListener("click", () => onBid && onBid(task));
    }

    // Attach reach-out button handler
    const reachBtn = card.querySelector(".reach-btn");
    if (reachBtn && task.status === "open") {
        reachBtn.addEventListener("click", () => openReachoutModal(task));
    }

    // Attach details button handler
    const detailsBtn = card.querySelector(".btn-details");
    if (detailsBtn) {
        detailsBtn.addEventListener("click", () => openTaskDetailModal(task));
    }

    return card;
}


// ─── Bid Modal ────────────────────────────────────────────────────────────────

// ─── Task Detail Modal ───────────────────────────────────────────────────────

/**
 * Open the Task Detail modal, showing full task info.
 * Bids list and inline bid form are also shown inside this modal.
 * @param {Task} task
 * @param {string} [currentStudentId] - Injected by app.js for the bid form
 */
export function openTaskDetailModal(task, currentStudentId) {
    // Meta strip
    const catEl = document.getElementById("td-category");
    if (catEl) {
        catEl.textContent = `${catEmoji(task.category)} ${task.category}`;
        catEl.className   = `category-tag ${catClass(task.category)}`;
    }
    const statusEl = document.getElementById("td-status");
    if (statusEl) statusEl.outerHTML = statusBadgeHtml(task.status);

    const budgetEl = document.getElementById("td-budget");
    if (budgetEl) budgetEl.textContent = formatUGX(task.budget);

    const dateEl = document.getElementById("td-date");
    if (dateEl) dateEl.textContent = task.created_at ? `Posted ${formatDate(task.created_at)}` : "";

    // Title & description
    const titleEl = document.getElementById("td-task-title");
    if (titleEl) titleEl.textContent = task.title;

    const descEl = document.getElementById("td-description");
    if (descEl) descEl.textContent = task.description;

    // Inline bid form hidden fields
    const taskIdEl = document.getElementById("td-bid-task-id");
    if (taskIdEl) taskIdEl.value = task.id;

    const studentIdEl = document.getElementById("td-bid-student-id");
    if (studentIdEl && currentStudentId) studentIdEl.value = currentStudentId;

    // Clear bids list — app.js will populate it
    const bidsListEl = document.getElementById("td-bids-list");
    if (bidsListEl) bidsListEl.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;">Loading bids…</p>`;

    const bidsCountEl = document.getElementById("td-bids-count");
    if (bidsCountEl) bidsCountEl.textContent = "";

    showModal("task-detail-modal");
}

/**
 * Close the Task Detail modal.
 */
export function closeTaskDetailModal() {
    closeModal("task-detail-modal");
    document.getElementById("td-bid-form")?.reset();
}


/**
 * Populate and open the bid modal for a specific task.
 * @param {Task} task
 */
export function openBidModal(task) {
    document.getElementById("bid-task-id").value        = task.id;
    document.getElementById("bid-preview-title").textContent  = task.title;
    document.getElementById("bid-preview-budget").textContent = `Budget: ${formatUGX(task.budget)}`;

    const catEl = document.getElementById("bid-preview-category");
    catEl.textContent  = `${catEmoji(task.category)} ${task.category}`;
    catEl.className    = `category-tag small ${catClass(task.category)}`;

    // Reset form
    document.getElementById("place-bid-form").reset();
    document.getElementById("bid-task-id").value = task.id; // re-set after reset

    showModal("bid-modal");
}

/**
 * Close the bid modal.
 */
export function closeBidModal() {
    closeModal("bid-modal");
}


// ─── Post Task Modal ──────────────────────────────────────────────────────────

export function openPostTaskModal() {
    showModal("post-task-modal");
}

export function closePostTaskModal() {
    closeModal("post-task-modal");
    document.getElementById("create-task-form").reset();
    document.getElementById("desc-counter").textContent = "0 / 500";
}


// ─── Modal helpers ────────────────────────────────────────────────────────────

function showModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove("hidden");
        // Move focus into the modal for accessibility
        const firstInput = el.querySelector("input:not([type=hidden]), select, textarea, button");
        if (firstInput) firstInput.focus();
    }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
}


// ─── Toast notifications ──────────────────────────────────────────────────────

const TOAST_ICONS = {
    success: "✅",
    error:   "❌",
    info:    "ℹ️",
};

/**
 * Show a toast notification.
 * @param {"success"|"error"|"info"} type
 * @param {string} title
 * @param {string} [message]
 * @param {number} [duration=4000] ms before auto-dismiss
 */
export function toast(type, title, message = "", duration = 4000) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.setAttribute("role", "alert");
    el.innerHTML = `
        <span class="toast-icon" aria-hidden="true">${TOAST_ICONS[type] || "•"}</span>
        <div class="toast-body">
            <div class="toast-title">${esc(title)}</div>
            ${message ? `<div class="toast-msg">${esc(message)}</div>` : ""}
        </div>
    `;

    container.appendChild(el);

    const dismiss = () => {
        el.classList.add("toast-exit");
        el.addEventListener("animationend", () => el.remove(), { once: true });
    };

    setTimeout(dismiss, duration);
    el.addEventListener("click", dismiss);
}


// ─── Button loading state ─────────────────────────────────────────────────────

/**
 * Toggle a button between its normal and loading states.
 * @param {HTMLButtonElement} btn
 * @param {boolean} loading
 */
export function setButtonLoading(btn, loading) {
    if (!btn) return;
    const label   = btn.querySelector(".btn-label");
    const spinner = btn.querySelector(".btn-spinner");

    btn.disabled = loading;
    if (label)   label.style.opacity  = loading ? "0.5" : "1";
    if (spinner) spinner.classList.toggle("hidden", !loading);
}


// ─── Character counter ────────────────────────────────────────────────────────

/**
 * Wire a textarea to a character counter element.
 * @param {string} textareaId
 * @param {string} counterId
 * @param {number} max
 */
export function wireCharCounter(textareaId, counterId, max) {
    const ta      = document.getElementById(textareaId);
    const counter = document.getElementById(counterId);
    if (!ta || !counter) return;

    const update = () => {
        const len = ta.value.length;
        counter.textContent = `${len} / ${max}`;
        counter.className = "char-counter" +
            (len > max * 0.9 ? " warning" : "") +
            (len > max       ? " over"    : "");
    };

    ta.addEventListener("input", update);
}


// ─── My Tasks — client dashboard ─────────────────────────────────────────────

const STATUS_ICON = {
    open:        "🟢",
    in_progress: "🔵",
    completed:   "✅",
    cancelled:   "❌",
};

/**
 * Render the client's task list in the #my-tasks-container element.
 * @param {Task[]} tasks
 * @param {Function} onViewBids  - Callback: (task) => void
 */
export function renderMyTasks(tasks, onViewBids) {
    const container = document.getElementById("my-tasks-container");
    if (!container) return;

    // Update stat counter
    const statEl = document.getElementById("stat-tasks-count");
    if (statEl) statEl.textContent = tasks.filter(t => t.status === "open").length;

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state" role="status">
                <div class="empty-state-icon">📭</div>
                <h4>No Tasks Yet</h4>
                <p>You haven't posted any tasks. Click <strong>Post a Task</strong> to get started.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = "";

    tasks.forEach((task) => {
        const card = document.createElement("div");
        card.className = "my-task-row";
        card.setAttribute("role", "listitem");

        const icon  = STATUS_ICON[task.status] || "⚙️";
        const label = STATUS_LABEL[task.status] || task.status;
        const cls   = STATUS_CSS[task.status]   || "status--open";

        card.innerHTML = `
            <div class="my-task-info">
                <div class="my-task-header">
                    <span class="category-tag small ${catClass(task.category)}">
                        ${catEmoji(task.category)} ${esc(task.category)}
                    </span>
                    <span class="status-badge ${cls}">${icon} ${esc(label)}</span>
                </div>
                <h4 class="my-task-title">${esc(task.title)}</h4>
                <p class="my-task-desc">${esc(task.description)}</p>
                <div class="my-task-meta">
                    <span class="task-budget">${formatUGX(task.budget)}</span>
                    ${task.created_at ? `<span class="task-date">Posted ${formatDate(task.created_at)}</span>` : ""}
                </div>
            </div>
            <button
                class="btn btn-view-bids"
                data-task-id="${esc(task.id)}"
                aria-label="View bids for ${esc(task.title)}"
            >
                <span class="bids-icon" aria-hidden="true">🏷️</span>
                View Bids
            </button>
        `;

        card.querySelector(".btn-view-bids")?.addEventListener("click", () => {
            onViewBids && onViewBids(task);
        });

        container.appendChild(card);
    });
}


// ─── Bids Panel & Task Detail (slide-in drawer) ─────────────────────────────

/**
 * Render the multi-stage visual Status Progress Stepper and dynamic action buttons.
 * @param {Task} task
 * @param {Function} [onSubmitWork] - Callback when student clicks "Submit Work"
 * @param {Function} [onApproveComplete] - Callback when client clicks "Approve & Complete"
 * @param {Function} [onLeaveReview] - Callback when client clicks "Leave a Review"
 */
export function renderTaskStepper(task, onSubmitWork, onApproveComplete, onLeaveReview) {
    const container = document.getElementById("bids-panel-stepper");
    if (!container || !task) return;

    if (task.status === "cancelled") {
        container.innerHTML = `
            <div class="cancelled-banner">
                <span>🔴</span>
                <span>This task has been cancelled.</span>
            </div>
        `;
        return;
    }

    // Step index mapping (1 to 4)
    const stepMap = {
        open: 1,
        assigned: 2,
        in_progress: 2,
        submitted: 3,
        completed: 4
    };

    const currentStep = stepMap[task.status] || 1;

    // Track fill percentage
    const fillPercent = currentStep === 1 ? 0 : currentStep === 2 ? 33 : currentStep === 3 ? 66 : 100;

    const steps = [
        { num: 1, label: "Posted", key: "open" },
        { num: 2, label: "In Progress", key: "in_progress" },
        { num: 3, label: "Submitted", key: "submitted" },
        { num: 4, label: "Completed", key: "completed" }
    ];

    const stepsHtml = steps.map((s) => {
        let stateCls = "";
        let circleContent = s.num;

        if (s.num < currentStep) {
            stateCls = "is-complete";
            circleContent = "✓";
        } else if (s.num === currentStep) {
            stateCls = "is-active";
            if (task.status === "submitted") stateCls += " is-submitted-active";
            if (task.status === "completed") stateCls += " is-completed-active";
        } else {
            stateCls = "is-upcoming";
        }

        return `
            <div class="stepper-item ${stateCls}">
                <div class="stepper-circle">${circleContent}</div>
                <span class="stepper-label">${s.label}</span>
            </div>
        `;
    }).join("");

    let actionBtnHtml = "";
    if (task.status === "assigned" || task.status === "in_progress") {
        actionBtnHtml = `
            <div class="stepper-actions">
                <div class="stepper-note">
                    <span>⚡</span> Work is active & in progress.
                </div>
                <button id="btn-action-submit-work" class="btn-submit-work">
                    📤 Mark Work as Submitted
                </button>
            </div>
        `;
    } else if (task.status === "submitted") {
        actionBtnHtml = `
            <div class="stepper-actions">
                <div class="stepper-note">
                    <span>🟣</span> Work submitted for review!
                </div>
                <button id="btn-action-approve-complete" class="btn-approve-complete">
                    ✅ Approve & Mark Completed
                </button>
            </div>
        `;
    } else if (task.status === "completed") {
        actionBtnHtml = `
            <div class="stepper-actions">
                <div class="stepper-note" style="color:#34d399;">
                    <span>🎉</span> Task verified & completed successfully.
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="stepper-header">
            <span class="stepper-title">
                <span>🔄</span> Progress Workflow
            </span>
            ${statusBadgeHtml(task.status)}
        </div>
        <div class="task-stepper">
            <div class="stepper-track">
                <div class="stepper-track-fill" style="width: ${fillPercent}%;"></div>
            </div>
            ${stepsHtml}
        </div>
        ${actionBtnHtml}
    `;

    // Attach event handlers for dynamic action buttons
    if (onSubmitWork && (task.status === "assigned" || task.status === "in_progress")) {
        const btn = container.querySelector("#btn-action-submit-work");
        btn?.addEventListener("click", () => onSubmitWork(task));
    }
    if (onApproveComplete && task.status === "submitted") {
        const btn = container.querySelector("#btn-action-approve-complete");
        btn?.addEventListener("click", () => onApproveComplete(task));
    }
    if (onLeaveReview && task.status === "completed") {
        const btn = container.querySelector("#btn-action-leave-review");
        btn?.addEventListener("click", () => onLeaveReview(task));
    }
}

/**
 * Open the bids panel overlay for a specific task.
 * @param {Task} task
 * @param {Function} [onSubmitWork]
 * @param {Function} [onApproveComplete]
 * @param {Function} [onLeaveReview]
 */
export function showBidsPanel(task, onSubmitWork, onApproveComplete, onLeaveReview) {
    const overlay = document.getElementById("bids-panel-overlay");
    const titleEl = document.getElementById("bids-panel-task-title");
    const budgetEl = document.getElementById("bids-panel-task-budget");

    if (titleEl)  titleEl.textContent  = task.title;
    if (budgetEl) budgetEl.textContent = `Budget: ${formatUGX(task.budget)}`;

    renderTaskStepper(task, onSubmitWork, onApproveComplete, onLeaveReview);

    // Show privacy shield immediately; contact box fills in async after bid fetch
    renderContactBox(null, task.status);

    if (overlay) {
        overlay.classList.remove("hidden");
        requestAnimationFrame(() => overlay.classList.add("open"));
    }
}

/**
 * Close the bids panel overlay.
 */
export function closeBidsPanel() {
    const overlay = document.getElementById("bids-panel-overlay");
    if (overlay) {
        overlay.classList.remove("open");
        overlay.addEventListener("transitionend", () => overlay.classList.add("hidden"), { once: true });
    }
}

/**
 * Render bids inside the bids panel.
 * Pass null to show a loading spinner.
 * @param {Bid[]|null} bids       - null = loading state
 * @param {Task} task
 * @param {Function} onAccept     - (bidId, task) => void
 * @param {Function} onReject     - (bidId, task) => void
 * @param {Function} [onSubmitWork]
 * @param {Function} [onApproveComplete]
 * @param {Function} [onLeaveReview]
 * @param {Review[]} [allReviews=[]]
 */
export function renderBidsInPanel(bids, task, onAccept, onReject, onSubmitWork, onApproveComplete, onLeaveReview, allReviews = []) {
    const list = document.getElementById("bids-panel-list");
    if (!list) return;

    renderTaskStepper(task, onSubmitWork, onApproveComplete, onLeaveReview);

    // Loading state
    if (bids === null) {
        list.innerHTML = `
            <div class="bids-loading">
                <div class="bid-skeleton"></div>
                <div class="bid-skeleton"></div>
                <div class="bid-skeleton"></div>
            </div>
        `;
        return;
    }

    const countEl = document.getElementById("bids-panel-count");
    if (countEl) countEl.textContent = `${bids.length} bid${bids.length !== 1 ? "s" : ""}`;

    if (bids.length === 0) {
        list.innerHTML = `
            <div class="empty-state bids-empty" role="status">
                <div class="empty-state-icon">🤷</div>
                <h4>No Bids Yet</h4>
                <p>No one has bid on this task yet. Check back soon!</p>
            </div>
        `;
        return;
    }

    list.innerHTML = "";

    const taskIsOpen = task.status === "open";

    bids.forEach((bid, index) => {
        const isBest = index === 0; // cheapest = best value
        const isPending = bid.status === "pending";

        const BID_STATUS_ICON = { pending: "⏳", accepted: "✅", rejected: "❌" };
        const BID_STATUS_CSS  = { pending: "bid-status--pending", accepted: "bid-status--accepted", rejected: "bid-status--rejected" };

        const ratingBadge = renderStudentRatingBadge(bid.student_id, allReviews);

        const bidCard = document.createElement("div");
        bidCard.className = `bid-card ${isBest ? "bid-card--best" : ""} bid-status-${bid.status}`;

        bidCard.innerHTML = `
            ${isBest ? `<div class="best-bid-badge">🏆 Best Value</div>` : ""}
            <div class="bid-card-header">
                <div class="bid-rank">#${index + 1}</div>
                <div class="bid-amount-block">
                    <span class="bid-amount">${formatUGX(bid.bid_amount)}</span>
                    ${isBest ? `<span class="bid-savings-tag">Lowest Bid</span>` : ""}
                </div>
                ${ratingBadge}
                <span class="bid-status-pill ${BID_STATUS_CSS[bid.status] || "bid-status--pending"}">
                    ${BID_STATUS_ICON[bid.status] || "⏳"} ${esc(bid.status)}
                </span>
            </div>
            <div class="bid-proposal-text">${esc(bid.proposal)}</div>
            <div class="bid-card-footer">
                <span class="bid-date">${bid.created_at ? formatDate(bid.created_at) : ""}</span>
                ${taskIsOpen && isPending ? `
                    <div class="bid-actions">
                        <button class="btn btn-accept" data-bid-id="${esc(bid.id)}" aria-label="Accept this bid">
                            ✅ Accept
                        </button>
                        <button class="btn btn-reject" data-bid-id="${esc(bid.id)}" aria-label="Reject this bid">
                            ✕ Reject
                        </button>
                    </div>
                ` : ""}
            </div>
        `;

        if (taskIsOpen && isPending) {
            bidCard.querySelector(".btn-accept")?.addEventListener("click", () => {
                onAccept && onAccept(bid.id, task);
            });
            bidCard.querySelector(".btn-reject")?.addEventListener("click", () => {
                onReject && onReject(bid.id, task);
            });
        }

        list.appendChild(bidCard);
    });
}


// ─── Reach-Out / Direct Inquiry Modal (Improvement 3) ─────────────────────────

/**
 * Open the Reach-Out modal pre-populated with the target task's context.
 * @param {Task} task
 */
export function openReachoutModal(task) {
    // Populate task context strip
    const catEl = document.getElementById("reachout-preview-category");
    if (catEl) {
        catEl.textContent = `${catEmoji(task.category)} ${task.category}`;
        catEl.className   = `category-tag small ${catClass(task.category)}`;
    }
    const titleEl = document.getElementById("reachout-preview-title");
    if (titleEl) titleEl.textContent = task.title;

    const budgetEl = document.getElementById("reachout-preview-budget");
    if (budgetEl) budgetEl.textContent = `Budget: ${formatUGX(task.budget)}`;

    // Pre-load hidden fields
    const taskIdEl = document.getElementById("reachout-task-id");
    if (taskIdEl) taskIdEl.value = task.id;

    const receiverEl = document.getElementById("reachout-receiver-id");
    if (receiverEl) receiverEl.value = task.client_id ?? "";

    // Update subtitle
    const subtitleEl = document.getElementById("reachout-modal-subtitle");
    if (subtitleEl) subtitleEl.textContent = `Direct offer for: "${task.title}"`;

    // Reset form & hide success state
    _reachoutShowView("form");
    document.getElementById("reachout-form")?.reset();
    // Restore task-id after reset
    if (taskIdEl) taskIdEl.value = task.id;
    if (receiverEl) receiverEl.value = task.client_id ?? "";

    // Reset char counter
    const counter = document.getElementById("reachout-msg-counter");
    if (counter) counter.textContent = "0 / 600";

    showModal("reachout-modal");
}

/**
 * Close the Reach-Out modal and reset it fully.
 */
export function closeReachoutModal() {
    closeModal("reachout-modal");
    _reachoutShowView("form");
    document.getElementById("reachout-form")?.reset();
}

/**
 * Reveal the animated success state inside the reach-out modal.
 * Called by app.js after a successful Supabase insert.
 */
export function showReachoutSuccess() {
    _reachoutShowView("success");
}

/**
 * Wire the live character counter on the reach-out message textarea.
 * (Called once from app.js DOMContentLoaded)
 */
export function wireReachoutCharCounter() {
    wireCharCounter("reachout-message", "reachout-msg-counter", 600);
}

/** @private Toggle between form and success views inside the modal. */
function _reachoutShowView(view) {
    const formEl    = document.getElementById("reachout-form");
    const successEl = document.getElementById("reachout-success");
    if (formEl)    formEl.style.display    = view === "form"    ? "" : "none";
    if (successEl) successEl.classList.toggle("hidden", view !== "success");
}


// ─── Student Rating & Review System (Improvement 5) ─────────────────────────

/**
 * Render student rating badge (average rating & total reviews count).
 * @param {string} userId
 * @param {Review[]} [allReviews=[]]
 * @returns {string} HTML string
 */
export function renderStudentRatingBadge(userId, allReviews = []) {
    const userReviews = allReviews.filter(r => r.reviewee_id === userId);
    if (userReviews.length === 0) {
        return `<span class="student-rating-badge"><span class="star-icon">★</span> New Student</span>`;
    }
    const sum = userReviews.reduce((acc, r) => acc + (r.rating || 5), 0);
    const avg = (sum / userReviews.length).toFixed(1);
    return `<span class="student-rating-badge" title="${avg} out of 5 stars from ${userReviews.length} reviews"><span class="star-icon">★</span> ${avg} (${userReviews.length})</span>`;
}

/**
 * Initialize interactive 5-star rating widget events.
 */
export function initStarRatingWidget() {
    const container = document.getElementById("star-rating-widget");
    if (!container) return;

    const stars = container.querySelectorAll(".star-btn");
    const valInput = document.getElementById("review-rating-value");
    const labelDisplay = document.getElementById("rating-label-display");

    const RATING_LABELS = {
        1: "1.0 / 5 — Needs Improvement 😞",
        2: "2.0 / 5 — Fair Effort 😐",
        3: "3.0 / 5 — Good Service 🙂",
        4: "4.0 / 5 — Very Good! 😊",
        5: "5.0 / 5 — Excellent Work! ⭐"
    };

    function setRating(rating) {
        if (valInput) valInput.value = rating;
        stars.forEach((s) => {
            const r = parseInt(s.dataset.rating, 10);
            s.classList.toggle("active", r <= rating);
        });
        if (labelDisplay) labelDisplay.textContent = RATING_LABELS[rating] || `${rating}.0 / 5`;
    }

    stars.forEach((star) => {
        const rating = parseInt(star.dataset.rating, 10);

        star.addEventListener("click", () => setRating(rating));

        star.addEventListener("mouseenter", () => {
            stars.forEach((s) => {
                const r = parseInt(s.dataset.rating, 10);
                s.classList.toggle("hovered", r <= rating);
            });
        });

        star.addEventListener("mouseleave", () => {
            stars.forEach((s) => s.classList.remove("hovered"));
        });
    });

    // Default 5 stars
    setRating(5);
}

/**
 * Open the Review modal pre-loaded with target task and student ID.
 * @param {Task} task
 * @param {string} revieweeId - student user_id being rated
 */
export function openReviewModal(task, revieweeId) {
    // Populate preview strip
    const catEl = document.getElementById("review-preview-category");
    if (catEl) {
        catEl.textContent = `${catEmoji(task.category)} ${task.category}`;
        catEl.className   = `category-tag small ${catClass(task.category)}`;
    }
    const titleEl = document.getElementById("review-preview-title");
    if (titleEl) titleEl.textContent = task.title;

    const budgetEl = document.getElementById("review-preview-budget");
    if (budgetEl) budgetEl.textContent = `Budget: ${formatUGX(task.budget)}`;

    // Set hidden inputs
    const taskIdEl = document.getElementById("review-task-id");
    if (taskIdEl) taskIdEl.value = task.id;

    const reviewerIdEl = document.getElementById("review-reviewer-id");
    if (reviewerIdEl) reviewerIdEl.value = task.client_id || "11111111-1111-1111-1111-111111111111";

    const revieweeIdEl = document.getElementById("review-reviewee-id");
    if (revieweeIdEl) revieweeIdEl.value = revieweeId || "22222222-2222-2222-2222-222222222222";

    // Reset comment box
    document.getElementById("create-review-form")?.reset();
    if (taskIdEl) taskIdEl.value = task.id;
    if (reviewerIdEl) reviewerIdEl.value = task.client_id || "11111111-1111-1111-1111-111111111111";
    if (revieweeIdEl) revieweeIdEl.value = revieweeId || "22222222-2222-2222-2222-222222222222";

    initStarRatingWidget();
    showModal("review-modal");
}

/**
 * Close the review modal.
 */
export function closeReviewModal() {
    closeModal("review-modal");
    document.getElementById("create-review-form")?.reset();
}


// ─── In-App Direct Contact (Improvement 6) ─────────────────────────────────────

/**
 * Format a Ugandan phone number into a valid wa.me URL.
 * Strips non-digits, converts leading 07x / 06x to 2567x / 2566x.
 * @param {string} phone
 * @returns {string} e.g. "https://wa.me/256700123456"
 */
export function formatWhatsAppUrl(phone) {
    if (!phone) return "#";
    // Remove all non-numeric characters
    let digits = phone.replace(/\D/g, "");

    // Uganda: 07x/06x → 2567x/2566x, already +256 → keep
    if (digits.startsWith("0") && digits.length >= 9) {
        digits = "256" + digits.slice(1);
    } else if (digits.startsWith("7") && digits.length === 9) {
        digits = "256" + digits;
    } else if (digits.startsWith("6") && digits.length === 9) {
        digits = "256" + digits;
    }

    return `https://wa.me/${digits}`;
}

/**
 * Mask a phone number for display: show only last 4 digits.
 * e.g. "+256 700 *** 456"
 * @param {string} phone
 * @returns {string}
 */
export function maskPhone(phone) {
    if (!phone) return "No phone on file";
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 4) return phone;
    const visible = digits.slice(-4);
    const masked  = "*".repeat(Math.max(0, digits.length - 4));
    return `+${masked.slice(0, -4)}${masked.slice(-4)}${visible}`.replace(/\+\*+/, "+256 ●●● ●●● ");
}

/**
 * Render (or hide) the Contact Details Box inside the bids panel.
 *
 * @param {Object|null} user        - The accepted student or client user object, or null for loading/hidden state
 * @param {string}      taskStatus  - Current task status
 */
export function renderContactBox(user, taskStatus) {
    const box     = document.getElementById("contact-details-box");
    const body    = document.getElementById("contact-box-body");
    if (!box || !body) return;

    const UNLOCKED_STATUSES = ["assigned", "in_progress", "submitted", "completed"];
    const isUnlocked = UNLOCKED_STATUSES.includes(taskStatus);

    // Always show the box once status is not 'open'
    box.classList.toggle("hidden", false);

    if (!isUnlocked) {
        // Privacy shield — contacts hidden while task is open
        body.innerHTML = `
            <div class="contact-privacy-shield">
                <span class="shield-icon">🔒</span>
                <span>Contact details are <strong>revealed only after a bid is accepted</strong> to protect everyone's privacy.</span>
            </div>
        `;
        return;
    }

    if (user === null) {
        // Loading skeleton
        body.innerHTML = `
            <div class="contact-loading">
                <div class="skeleton-avatar"></div>
                <div class="skeleton-lines">
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line short"></div>
                </div>
            </div>
        `;
        return;
    }

    if (!user || (!user.phone && !user.full_name)) {
        body.innerHTML = `
            <div class="contact-privacy-shield">
                <span class="shield-icon">❕</span>
                <span>No contact info available for this user yet.</span>
            </div>
        `;
        return;
    }

    const name      = user.full_name || "Student";
    const initials  = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const phone     = user.phone || null;
    const waUrl     = phone ? formatWhatsAppUrl(phone) : null;
    const telUrl    = phone ? `tel:${phone.replace(/\s/g, "")}` : null;
    const maskedPh  = phone ? maskPhone(phone) : null;
    const roleIcon  = user.role === "client" ? "🏢" : "🎓";

    body.innerHTML = `
        <div class="contact-person-card">
            <div class="contact-person-avatar">${esc(initials)}</div>
            <div class="contact-person-info">
                <p class="contact-person-name">${esc(name)}</p>
                <span class="contact-person-role">${roleIcon} ${esc(user.role || "Student")}</span>
                ${maskedPh ? `<div class="contact-phone-masked">📞 ${esc(maskedPh)}</div>` : ""}
            </div>
        </div>
        ${phone ? `
        <div class="contact-actions">
            <a href="${esc(telUrl)}" class="btn-contact-call" aria-label="Call ${esc(name)}">
                📞 Call
            </a>
            <a href="${esc(waUrl)}" target="_blank" rel="noopener noreferrer" class="btn-contact-whatsapp" aria-label="WhatsApp ${esc(name)}">
                💬 WhatsApp
            </a>
        </div>
        ` : `
        <div class="contact-privacy-shield" style="margin-top:0">
            <span class="shield-icon">📵</span>
            <span>${esc(name)} hasn’t added a phone number yet.</span>
        </div>
        `}
    `;
}

// ─── Bid Explorer — Category-Grouped Accordion ──────────────────────────────────────────

const EXPLORER_CATEGORIES = [
    "Tech Repair",
    "Tutoring",
    "Graphic Design",
    "Campus Logistics",
    "Other",
];

/**
 * Render the Bid Explorer.
 * @param {Task[]}   tasks
 * @param {Bid[]}    bids
 * @param {Review[]} allReviews
 * @param {Function} onReachOut - (task) => void
 * @param {string}   catFilter
 */
export function renderBidExplorer(tasks, bids, allReviews, onReachOut, catFilter = "All") {
    const container = document.getElementById("bid-explorer-container");
    if (!container) return;

    if (tasks === null) {
        container.innerHTML = `
            <div class="explorer-loading">
                <div class="explorer-skeleton-group">
                    <div class="explorer-skeleton-header"></div>
                    <div class="explorer-skeleton-row"></div>
                    <div class="explorer-skeleton-row short"></div>
                </div>
                <div class="explorer-skeleton-group">
                    <div class="explorer-skeleton-header"></div>
                    <div class="explorer-skeleton-row"></div>
                </div>
            </div>
        `;
        return;
    }

    const bidsByTask = {};
    (Array.isArray(bids) ? bids : []).forEach((b) => {
        if (!bidsByTask[b.task_id]) bidsByTask[b.task_id] = [];
        bidsByTask[b.task_id].push(b);
    });
    Object.values(bidsByTask).forEach((arr) => arr.sort((a, b) => a.bid_amount - b.bid_amount));

    const categoriesToShow = catFilter === "All"
        ? EXPLORER_CATEGORIES
        : EXPLORER_CATEGORIES.filter((c) => c === catFilter);

    container.innerHTML = "";
    let renderedAny = false;

    categoriesToShow.forEach((cat) => {
        const catTasks = (Array.isArray(tasks) ? tasks : []).filter((t) => t.category === cat);
        if (catTasks.length === 0) return;
        renderedAny = true;

        const totalBids = catTasks.reduce((sum, t) => sum + (bidsByTask[t.id]?.length || 0), 0);

        const group = document.createElement("div");
        group.className = "explorer-cat-group";
        group.setAttribute("role", "listitem");

        const catId = CSS.escape(cat);
        const taskCount = catTasks.length + " task" + (catTasks.length !== 1 ? "s" : "");
        const bidCount  = totalBids + " bid"  + (totalBids  !== 1 ? "s" : "");

        group.innerHTML = "<button class=\"explorer-cat-header\" aria-expanded=\"true\"" +
            " aria-controls=\"excat-body-" + catId + "\" id=\"excat-hdr-" + catId + "\">" +
            "<div class=\"excat-header-left\">" +
                "<span class=\"excat-emoji\">" + catEmoji(cat) + "</span>" +
                "<span class=\"excat-name\">" + esc(cat) + "</span>" +
                "<span class=\"excat-counts\">" +
                    "<span class=\"excat-badge excat-badge--tasks\">" + taskCount + "</span>" +
                    "<span class=\"excat-badge excat-badge--bids\">" + bidCount + "</span>" +
                "</span>" +
            "</div>" +
            "<span class=\"excat-chevron\" aria-hidden=\"true\">&#9660;</span>" +
            "</button>" +
            "<div id=\"excat-body-" + catId + "\" class=\"explorer-cat-body\" role=\"list\"></div>";

        const catBody = group.querySelector(".explorer-cat-body");
        const hdrBtn  = group.querySelector(".explorer-cat-header");
        hdrBtn.addEventListener("click", () => {
            const expanded = hdrBtn.getAttribute("aria-expanded") === "true";
            hdrBtn.setAttribute("aria-expanded", String(!expanded));
            catBody.classList.toggle("is-collapsed", expanded);
            group.querySelector(".excat-chevron").innerHTML = expanded ? "&#9658;" : "&#9660;";
        });

        catTasks.forEach((task) => {
            const taskBids = bidsByTask[task.id] || [];
            const hasBids  = taskBids.length > 0;
            const bidPillCls  = hasBids ? "has-bids" : "no-bids-pill";
            const bidPillText = hasBids ? "&#127991; " + taskBids.length + " bid" + (taskBids.length !== 1 ? "s" : "") : "No bids yet";

            const taskRow = document.createElement("div");
            taskRow.className = "explorer-task-row";
            taskRow.setAttribute("role", "listitem");

            const chevHtml = hasBids ? "&#9658;" : "&mdash;";
            const dateHtml = task.created_at ? "<span class=\"extask-date\">&middot; " + formatDate(task.created_at) + "</span>" : "";

            taskRow.innerHTML = "<button class=\"explorer-task-header\" aria-expanded=\"false\"" +
                " aria-controls=\"extask-bids-" + esc(task.id) + "\">" +
                "<div class=\"extask-left\">" +
                    "<span class=\"extask-chevron\" aria-hidden=\"true\">" + chevHtml + "</span>" +
                    "<div class=\"extask-info\">" +
                        "<span class=\"extask-title\">" + esc(task.title) + "</span>" +
                        "<span class=\"extask-meta\">" +
                            "<span class=\"task-budget\">" + formatUGX(task.budget) + "</span>" +
                            dateHtml +
                        "</span>" +
                    "</div>" +
                "</div>" +
                "<div class=\"extask-right\">" +
                    "<span class=\"extask-bid-pill " + bidPillCls + "\">" + bidPillText + "</span>" +
                    statusBadgeHtml(task.status) +
                "</div>" +
                "</button>" +
                "<div id=\"extask-bids-" + esc(task.id) + "\" class=\"explorer-bids-body is-collapsed\" role=\"list\"></div>";

            const taskHdr  = taskRow.querySelector(".explorer-task-header");
            const bidsBody = taskRow.querySelector(".explorer-bids-body");
            const chevron  = taskRow.querySelector(".extask-chevron");

            if (hasBids) {
                taskBids.forEach((bid, idx) => {
                    const isBest = idx === 0;
                    const ratingBadge = renderStudentRatingBadge(bid.student_id, allReviews);
                    const BID_CSS  = { pending: "bid-status--pending", accepted: "bid-status--accepted", rejected: "bid-status--rejected" };
                    const BID_ICO  = { pending: "&#9203;", accepted: "&#9989;", rejected: "&#10060;" };

                    const bidItem = document.createElement("div");
                    bidItem.className = "explorer-bid-item" + (isBest ? " explorer-bid-item--best" : "");
                    bidItem.setAttribute("role", "listitem");

                    const sCls  = BID_CSS[bid.status]  || "bid-status--pending";
                    const sIco  = BID_ICO[bid.status] || "&#9203;";
                    const bDate = bid.created_at ? formatDate(bid.created_at) : "";

                    bidItem.innerHTML =
                        (isBest ? "<div class=\"explorer-best-badge\">&#127942; Best Value</div>" : "") +
                        "<div class=\"explorer-bid-row\">" +
                            "<div class=\"explorer-bid-left\">" +
                                "<span class=\"explorer-bid-rank\">#" + (idx + 1) + "</span>" +
                                "<div class=\"explorer-bid-details\">" +
                                    "<span class=\"explorer-bid-amount\">" + formatUGX(bid.bid_amount) + "</span>" +
                                    ratingBadge +
                                    "<span class=\"bid-status-pill " + sCls + "\">" + sIco + " " + esc(bid.status) + "</span>" +
                                "</div>" +
                                "<p class=\"explorer-bid-proposal\">" + esc(bid.proposal) + "</p>" +
                                (bDate ? "<span class=\"explorer-bid-date\">" + bDate + "</span>" : "") +
                            "</div>" +
                            "<div class=\"explorer-bid-actions\">" +
                                "<button class=\"btn-explorer-reachout\"" +
                                    " data-task-id=\"" + esc(task.id) + "\"" +
                                    " data-bid-id=\"" + esc(bid.id) + "\"" +
                                    " aria-label=\"Reach out about a bid on " + esc(task.title) + "\"" +
                                    " title=\"Send a message to the task poster\">" +
                                    "&#128140; Reach Out" +
                                "</button>" +
                            "</div>" +
                        "</div>";

                    bidItem.querySelector(".btn-explorer-reachout")?.addEventListener("click", () => {
                        onReachOut && onReachOut(task);
                    });

                    bidsBody.appendChild(bidItem);
                });

                taskHdr.addEventListener("click", () => {
                    const expanded = taskHdr.getAttribute("aria-expanded") === "true";
                    taskHdr.setAttribute("aria-expanded", String(!expanded));
                    bidsBody.classList.toggle("is-collapsed", expanded);
                    chevron.innerHTML = expanded ? "&#9658;" : "&#9660;";
                });
            } else {
                const noBidsEl = document.createElement("div");
                noBidsEl.className = "explorer-no-bids-msg";
                noBidsEl.textContent = "No proposals submitted yet for this task.";
                bidsBody.classList.remove("is-collapsed");
                bidsBody.appendChild(noBidsEl);
            }

            catBody.appendChild(taskRow);
        });

        container.appendChild(group);
    });

    if (!renderedAny) {
        const emptyMsg = catFilter === "All"
            ? "No open tasks with bids have been posted yet. Check back soon!"
            : "No open tasks found in <strong>" + esc(catFilter) + "</strong> right now.";
        container.innerHTML = "<div class=\"empty-state\" role=\"status\">" +
            "<div class=\"empty-state-icon\">&#128269;</div>" +
            "<h4>Nothing to Explore Yet</h4>" +
            "<p>" + emptyMsg + "</p>" +
            "</div>";
    }
}
