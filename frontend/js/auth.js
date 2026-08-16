/**
 * auth.js — The Bridge Protocol
 *
 * Supabase Auth helpers. Handles:
 *   - Sign in with email + password
 *   - Sign up (creates auth.users entry + public users table row)
 *   - Forgot password (sends Supabase reset email)
 *   - Session retrieval / logout
 *
 * Uses the Supabase JS SDK v2 loaded via ESM CDN.
 */

// ─── Supabase client ──────────────────────────────────────────────────────────

const SUPABASE_URL  = "https://ldrjyiwyevnzoyaymtwb.supabase.co";
const SUPABASE_ANON = "sb_publishable_wHsooWjaNo8zMUgotgOVZw_zp9xY695";

// Load Supabase JS v2 from CDN (ESM)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/** Shared Supabase client — used across auth.js and can be imported elsewhere */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

const REST = `${SUPABASE_URL}/rest/v1`;

// ─── Session helpers ──────────────────────────────────────────────────────────

/**
 * Get the current active session (null if not logged in).
 * @returns {Promise<import("@supabase/supabase-js").Session|null>}
 */
export async function getSession() {
    const { data } = await supabase.auth.getSession();
    return data?.session ?? null;
}

/**
 * Get the current logged-in user object (null if not logged in).
 * @returns {Promise<import("@supabase/supabase-js").User|null>}
 */
export async function getCurrentUser() {
    const { data } = await supabase.auth.getUser();
    return data?.user ?? null;
}

/**
 * Sign out the current user and redirect to auth.html.
 */
export async function logout() {
    await supabase.auth.signOut();
    window.location.href = "auth.html";
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

/**
 * Call this at the top of index.html's boot script.
 * If there is no active session, redirect to auth.html.
 * Returns the session if valid.
 */
export async function requireAuth() {
    const session = await getSession();
    if (!session) {
        window.location.href = "auth.html";
        return null;
    }
    return session;
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * Sign in with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ok: boolean, session: object|null, message: string}>}
 */
export async function loginUser(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        return { ok: false, session: null, message: friendlyError(error.message) };
    }
    return { ok: true, session: data.session, message: "Logged in" };
}

// ─── Register ─────────────────────────────────────────────────────────────────

/**
 * Register a new user.
 * 1. Creates an entry in Supabase auth.users (handles password hashing + JWT).
 * 2. Inserts a matching profile row into the public `users` table.
 *
 * @param {string} email
 * @param {string} password
 * @param {string} fullName
 * @param {"client"|"student"} role
 * @param {string} [phone]
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function registerUser(email, password, fullName, role, phone = null) {
    // Step 1 — create auth user
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: fullName, role },   // stored in auth.users.raw_user_meta_data
        },
    });

    if (error) {
        return { ok: false, message: friendlyError(error.message) };
    }

    // Step 2 — insert into public users table
    // Use the Supabase REST API directly so we can pass the anon key
    try {
        const userId = data.user?.id;
        if (userId) {
            const payload = {
                id:        userId,
                full_name: fullName,
                email,
                role,
                ...(phone ? { phone } : {}),
            };

            const res = await fetch(`${REST}/users`, {
                method:  "POST",
                headers: {
                    "apikey":        SUPABASE_ANON,
                    "Authorization": `Bearer ${data.session?.access_token ?? SUPABASE_ANON}`,
                    "Content-Type":  "application/json",
                    "Prefer":        "return=representation",
                },
                body: JSON.stringify(payload),
            });

            // 409 Conflict = user row already exists (rare but OK)
            if (!res.ok && res.status !== 409) {
                const err = await res.json().catch(() => ({}));
                console.warn("[auth] Could not insert into users table:", err);
            }
        }
    } catch (profileErr) {
        console.warn("[auth] Profile insert failed:", profileErr);
    }

    return {
        ok: true,
        message: data.session
            ? "Account created! Welcome aboard 🎉"
            : "Account created! Check your email to confirm your address.",
    };
}

// ─── Forgot Password ──────────────────────────────────────────────────────────

/**
 * Send a Supabase password-reset email.
 * @param {string} email
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function forgotPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth.html?reset=true`,
    });
    if (error) {
        return { ok: false, message: friendlyError(error.message) };
    }
    return { ok: true, message: "Password reset email sent! Check your inbox." };
}

// ─── Error messages ───────────────────────────────────────────────────────────

/**
 * Convert Supabase/GoTrue error messages into user-friendly strings.
 * @param {string} raw
 * @returns {string}
 */
function friendlyError(raw = "") {
    const msg = raw.toLowerCase();
    if (msg.includes("invalid login credentials"))  return "Invalid email or password. Please try again.";
    if (msg.includes("email not confirmed"))         return "Please confirm your email before logging in.";
    if (msg.includes("user already registered"))     return "An account with this email already exists. Try logging in.";
    if (msg.includes("password should be"))          return "Password must be at least 6 characters.";
    if (msg.includes("rate limit"))                  return "Too many attempts. Please wait a moment and try again.";
    if (msg.includes("network"))                     return "Cannot reach the server. Check your internet connection.";
    return raw || "Something went wrong. Please try again.";
}
