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
    in_progress: "status--in-progress",
    completed:   "status--completed",
    cancelled:   "status--cancelled",
};

const STATUS_LABEL = {
    open:        "Open",
    in_progress: "In Progress",
    completed:   "Completed",
    cancelled:   "Cancelled",
};

/**
 * @param {string} status
 * @returns {string} HTML for the status badge
 */
function statusBadgeHtml(status) {
    const cls   = STATUS_CSS[status]   || "status--open";
    const label = STATUS_LABEL[status] || status;
    return `<span class="status-badge ${cls}">${esc(label)}</span>`;
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
        : `The backend API is not yet deployed to production. Tasks will load once the backend is live.`;

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
            <button
                class="btn btn-primary apply-btn"
                data-task-id="${esc(task.id)}"
                aria-label="Apply or bid on ${esc(task.title)}"
                ${task.status !== "open" ? "disabled" : ""}
            >
                ${task.status === "open" ? "Apply / Bid" : "Closed"}
            </button>
        </div>
    `;

    // Attach bid button handler
    const applyBtn = card.querySelector(".apply-btn");
    if (applyBtn && task.status === "open") {
        applyBtn.addEventListener("click", () => onBid && onBid(task));
    }

    return card;
}


// ─── Bid Modal ────────────────────────────────────────────────────────────────

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


// ─── Bids Panel (slide-in drawer) ─────────────────────────────────────────────

/**
 * Open the bids panel overlay for a specific task.
 * @param {Task} task
 */
export function showBidsPanel(task) {
    const overlay = document.getElementById("bids-panel-overlay");
    const titleEl = document.getElementById("bids-panel-task-title");
    const budgetEl = document.getElementById("bids-panel-task-budget");

    if (titleEl)  titleEl.textContent  = task.title;
    if (budgetEl) budgetEl.textContent = `Budget: ${formatUGX(task.budget)}`;

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
 */
export function renderBidsInPanel(bids, task, onAccept, onReject) {
    const list = document.getElementById("bids-panel-list");
    if (!list) return;

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
