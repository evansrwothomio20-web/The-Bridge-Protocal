-- =============================================================
-- The Bridge Protocol - Supabase Database Schema
-- Run this entire script in the Supabase SQL Editor to
-- initialise (or reset) your project's tables.
-- =============================================================

-- Enable the pgcrypto extension so we can generate UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================
-- TABLE: users
-- Stores both clients and students who sign up on the platform.
-- =============================================================

CREATE TABLE IF NOT EXISTS users (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name   TEXT        NOT NULL CHECK (char_length(full_name) >= 2),
    email       TEXT        NOT NULL UNIQUE,
    role        TEXT        NOT NULL CHECK (role IN ('client', 'student')),
    phone       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast email lookups (login / duplicate checks)
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Index for filtering by role
CREATE INDEX IF NOT EXISTS idx_users_role  ON users (role);


-- =============================================================
-- TABLE: tasks
-- Tasks posted by clients and optionally claimed by students.
-- =============================================================

CREATE TABLE IF NOT EXISTS tasks (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL CHECK (char_length(title) >= 3),
    description TEXT        NOT NULL CHECK (char_length(description) >= 10),
    category    TEXT        NOT NULL CHECK (char_length(category) >= 2),
    budget      NUMERIC(12, 2) NOT NULL CHECK (budget > 0),
    client_id   UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status      TEXT        NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for listing tasks by status (e.g. all open tasks)
CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks (status);

-- Index for a client's own tasks
CREATE INDEX IF NOT EXISTS idx_tasks_client_id ON tasks (client_id);

-- Index for category-based filtering / searching
CREATE INDEX IF NOT EXISTS idx_tasks_category  ON tasks (category);


-- =============================================================
-- TABLE: bids
-- Bids placed by students on open tasks.
-- =============================================================

CREATE TABLE IF NOT EXISTS bids (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID        NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    student_id  UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    bid_amount  NUMERIC(12, 2) NOT NULL CHECK (bid_amount > 0),
    proposal    TEXT        NOT NULL CHECK (char_length(proposal) >= 10),
    status      TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fetching all bids on a specific task
CREATE INDEX IF NOT EXISTS idx_bids_task_id    ON bids (task_id);

-- Index for fetching all bids by a specific student
CREATE INDEX IF NOT EXISTS idx_bids_student_id ON bids (student_id);

-- Index for filtering bids by status
CREATE INDEX IF NOT EXISTS idx_bids_status     ON bids (status);


-- =============================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================

-- ---- users ----
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_users"
    ON users FOR ALL
    USING      (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "anon_read_users"
    ON users FOR SELECT
    USING (true);

CREATE POLICY "anon_insert_users"
    ON users FOR INSERT
    WITH CHECK (true);

CREATE POLICY "anon_update_users"
    ON users FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "anon_delete_users"
    ON users FOR DELETE
    USING (true);


-- ---- tasks ----
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_tasks"
    ON tasks FOR ALL
    USING      (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "anon_read_tasks"
    ON tasks FOR SELECT
    USING (true);

CREATE POLICY "anon_insert_tasks"
    ON tasks FOR INSERT
    WITH CHECK (true);

CREATE POLICY "anon_update_tasks"
    ON tasks FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "anon_delete_tasks"
    ON tasks FOR DELETE
    USING (true);


-- ---- bids ----
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_bids"
    ON bids FOR ALL
    USING      (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "anon_read_bids"
    ON bids FOR SELECT
    USING (true);

CREATE POLICY "anon_insert_bids"
    ON bids FOR INSERT
    WITH CHECK (true);

CREATE POLICY "anon_update_bids"
    ON bids FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "anon_delete_bids"
    ON bids FOR DELETE
    USING (true);


-- =============================================================
-- TABLE: direct_inquiries  (Improvement 3 — Reach-Out)
-- Allows students / providers to message a task poster directly,
-- bypassing the formal bid flow for fast, personal outreach.
-- =============================================================

CREATE TABLE IF NOT EXISTS direct_inquiries (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id      UUID        NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    sender_id    TEXT        NOT NULL,          -- UUID or anon handle of the sender
    receiver_id  TEXT        NOT NULL,          -- client_id of the task poster
    subject      TEXT        NOT NULL CHECK (char_length(subject)      >= 5),
    message      TEXT        NOT NULL CHECK (char_length(message)      >= 20),
    contact_info TEXT        NOT NULL CHECK (char_length(contact_info) >= 7),
    status       TEXT        NOT NULL DEFAULT 'unread'
                             CHECK (status IN ('unread', 'read', 'replied')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup: all inquiries for a specific task
CREATE INDEX IF NOT EXISTS idx_direct_inquiries_task_id
    ON direct_inquiries (task_id);

-- Fast lookup: all inquiries aimed at a specific receiver (client inbox)
CREATE INDEX IF NOT EXISTS idx_direct_inquiries_receiver_id
    ON direct_inquiries (receiver_id);

-- Fast lookup: all inquiries sent by a specific student
CREATE INDEX IF NOT EXISTS idx_direct_inquiries_sender_id
    ON direct_inquiries (sender_id);


-- ---- direct_inquiries RLS ----
ALTER TABLE direct_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_direct_inquiries"
    ON direct_inquiries FOR ALL
    USING      (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Allow anyone to read inquiries (testing — tighten in production)
CREATE POLICY "anon_read_direct_inquiries"
    ON direct_inquiries FOR SELECT
    USING (true);

-- Allow anyone to insert an inquiry (testing — tighten in production)
CREATE POLICY "anon_insert_direct_inquiries"
    ON direct_inquiries FOR INSERT
    WITH CHECK (true);

-- Allow status updates (e.g. mark as read/replied) by anyone
CREATE POLICY "anon_update_direct_inquiries"
    ON direct_inquiries FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Allow deletion by anyone (testing — restrict to sender in production)
CREATE POLICY "anon_delete_direct_inquiries"
    ON direct_inquiries FOR DELETE
    USING (true);