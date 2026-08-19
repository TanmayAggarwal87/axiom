-- Migration: Add session routes and report persistence tables
-- Adds 'query' and 'status' columns to the 'sessions' table, and creates the 'session_reports' table.

-- 1. Extend the sessions table with new columns if not already present
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS query TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'in_progress';

-- 2. Create the session_reports table
CREATE TABLE IF NOT EXISTS session_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,           -- owner's Clerk user ID
  report_json JSONB NOT NULL,      -- CompiledReport JSON structure (contains overview, sections, citations, payments, budget, etc.)
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id)              -- exactly one stored report per session
);

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_session_reports_session_id ON session_reports (session_id);
