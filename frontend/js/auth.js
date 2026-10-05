/**
 * auth.js - The Bridge Protocol
 *
 * Authentication: Clerk (Email + Password, OTP email verification on sign-up)
 * Database:       Supabase (unchanged - tasks, bids, users, reviews, inquiries)
 *
 * KEY FIX: waitForClerk() now has two phases.
 * Phase 1 - waits for window.Clerk and calls load().
 * Phase 2 - polls until window.Clerk.session !== undefined.
 *
 * window.Clerk.user can be null briefly after load() while Clerk fetches
 * the session from its servers.  Checking session (not user) is reliable.
 *   session === undefined  ->  still resolving
 *   session === null       ->  not signed in
 *   session === object     ->  signed in
 */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL  = "https://ldrjyiwyevnzoyaymtwb.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxkcmp5aXd5ZXZuem95YXltdHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTEzMzUsImV4cCI6MjEwMDk4NzMzNX0.Gk4i-SaIqdn_VSuB-LszVkHKAHNv4y1Zwgr5gAi4LoU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

async function waitForClerk(timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;

    // Phase 1: wait for SDK then load()
    while (Date.now() < deadline) {
        if (window.Clerk && typeof window.Clerk.load === "function") {
            try { await window.Clerk.load(); } catch (_) {}
            break;
        }
        await new Promise(r => setTimeout(r, 80));
    }

    if (!window.Clerk) {
        console.warn("[auth] Clerk SDK unavailable.");
        return;
    }

    // Phase 2: wait for session state to settle (not undefined)
    while (Date.now() < deadline) {
        if (window.Clerk.session !== undefined) return;
        await new Promise(r => setTimeout(r, 80));
    }
    console.warn("[auth] Clerk session resolution timed out.");
}

async function findUserByEmail(email) {
    const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", email)
        .maybeSingle();
    if (error) console.error("[auth] findUserByEmail:", error.message);
    return data ?? null;
}

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

async function resolveProfile(clerkUser) {
    const email = clerkUser.primaryEmailAddress?.emailAddress;
    if (!email) { console.error("[auth] No primary email."); return null; }

    const existing = await findUserByEmail(email);
    if (existing) return existing;

    const parts    = [clerkUser.firstName || "", clerkUser.lastName || ""].filter(Boolean);
    const fullName = parts.join(" ") || email.split("@")[0];
    return await insertUserRow({ email, full_name: fullName, role: "client" });
}

export async function getCurrentUser() {
    await waitForClerk();
    return window.Clerk?.user ?? null;
}

export async function getSession() {
    await waitForClerk();

    const clerkSession = window.Clerk?.session;
    const clerkUser    = window.Clerk?.user;

    if (!clerkSession || !clerkUser) {
        console.log("[auth] getSession: not signed in.");
        return null;
    }

    const profile = await resolveProfile(clerkUser);
    if (!profile) {
        console.warn("[auth] getSession: no Supabase profile.");
        return null;
    }

    console.log("[auth] getSession OK:", profile.email);
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

export async function requireAuth() {
    await waitForClerk();
    if (!window.Clerk?.session) {
        console.log("[auth] requireAuth: no session -> auth.html");
        window.location.href = "auth.html";
        return null;
    }
    console.log("[auth] requireAuth: session OK.");
    return window.Clerk.user;
}

export async function logout() {
    await waitForClerk();
    await window.Clerk?.signOut();
    window.location.href = "auth.html";
}
