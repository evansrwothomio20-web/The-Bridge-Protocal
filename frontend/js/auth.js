/**
 * auth.js — The Bridge Protocol
 *
 * Authentication: Clerk (Email OTP sign-in — passwordless)
 * Database:       Supabase (unchanged — tasks, bids, users, reviews, inquiries)
 *
 * Strategy
 * ────────
 *  • Clerk handles identity: email OTP, sessions, and sign-out.
 *  • Supabase is used ONLY as a database. Its own auth is bypassed entirely.
 *  • On first Clerk sign-in we look up the user by email in public.users.
 *    If no row exists we create one with a fresh UUID so all FK references
 *    (tasks.client_id, bids.student_id, …) keep working unchanged.
 *  • getSession() returns a shape compatible with the existing app.js:
 *      { user: { id: <uuid>, email, user_metadata: { full_name, role } } }
 */

// ─── Supabase client (database queries only) ─────────────────────────────────

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL  = "https://ldrjyiwyevnzoyaymtwb.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxkcmp5aXd5ZXZuem95YXltdHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTEzMzUsImV4cCI6MjEwMDk4NzMzNX0.Gk4i-SaIqdn_VSuB-LszVkHKAHNv4y1Zwgr5gAi4LoU";

/** Shared Supabase client — imported by api.js for all DB queries */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── Clerk bootstrap ─────────────────────────────────────────────────────────

/**
 * Wait for the Clerk browser SDK to finish loading.
 * The CDN <script> tag on each page calls Clerk.load() automatically,
 * but ES modules may execute before it completes — so we poll briefly.
 * @param {number} [timeoutMs=8000]
 */
async function waitForClerk(timeoutMs = 8000) {
    if (window.__clerkReady) return;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (window.Clerk && typeof window.Clerk.load === "function") {
            try { await window.Clerk.load(); } catch (_) { /* already loaded */ }
            window.__clerkReady = true;
            return;
        }
        await new Promise(r => setTimeout(r, 80));
    }
    console.warn("[auth] Clerk SDK did not load within the timeout period.");
}

// ─── Supabase profile helpers ─────────────────────────────────────────────────

/**
 * Look up a public.users row by email.
 * @param {string} email
 * @returns {Promise<object|null>}
 */
async function findUserByEmail(email) {
    const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .maybeSingle();
    if (error) console.error("[auth] findUserByEmail:", error.message);
    return data ?? null;
}

/**
 * Insert a new row into public.users for a first-time Clerk sign-in.
 * Uses crypto.randomUUID() to generate a valid UUID for the PK.
 * @param {{ email:string, full_name:string, role?:string }} payload
 * @returns {Promise<object|null>}
 */
async function insertUserRow({ email, full_name, role = "client" }) {
    const id = crypto.randomUUID();
    const { data, error } = await supabase
        .from("users")
        .insert({ id, email, full_name, role })
        .select()
        .single();
    if (error) console.error("[auth] insertUserRow:", error.message);
    return data ?? null;
}

/**
 * Resolve (or lazily create) the public.users row for the Clerk user.
 * Returns the row or null.
 * @param {object} clerkUser — window.Clerk.user
 */
async function resolveProfile(clerkUser) {
    const email = clerkUser.primaryEmailAddress?.emailAddress;
    if (!email) {
        console.error("[auth] Clerk user has no primary email address.");
        return null;
    }

    // Try existing row first
    const existing = await findUserByEmail(email);
    if (existing) return existing;

    // First sign-in: create the row
    const first    = clerkUser.firstName || "";
    const last     = clerkUser.lastName  || "";
    const fullName = [first, last].filter(Boolean).join(" ") || email.split("@")[0];
    return await insertUserRow({ email, full_name: fullName, role: "client" });
}

// ─── Public auth API ─────────────────────────────────────────────────────────

/**
 * Return the current Clerk user, or null if not signed in.
 */
export async function getCurrentUser() {
    await waitForClerk();
    return window.Clerk?.user ?? null;
}

/**
 * Return a session-shaped object compatible with app.js:
 *   { user: { id, email, user_metadata: { full_name, role } } }
 * Returns null if the user is not signed in via Clerk.
 */
export async function getSession() {
    await waitForClerk();
    const clerkUser = window.Clerk?.user;
    if (!clerkUser) return null;

    const profile = await resolveProfile(clerkUser);
    if (!profile) return null;

    return {
        user: {
            id:    profile.id,
            email: profile.email,
            user_metadata: {
                full_name: profile.full_name,
                role:      profile.role,
            },
        },
    };
}

/**
 * Redirect to auth.html when there is no active Clerk session.
 * Returns the Clerk user object when authenticated.
 */
export async function requireAuth() {
    await waitForClerk();
    if (!window.Clerk?.user) {
        window.location.href = "auth.html";
        return null;
    }
    return window.Clerk.user;
}

/**
 * Sign the user out of Clerk and redirect to auth.html.
 */
export async function logout() {
    await waitForClerk();
    await window.Clerk?.signOut();
    window.location.href = "auth.html";
}
