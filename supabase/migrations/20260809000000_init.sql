-- Axiom Database Schema Migration
-- Module 1: Orchestrator, Planning & Shared State

-- 1. Users/Credits table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  credits NUMERIC(10, 4) NOT NULL DEFAULT 10.0000
);

-- 2. Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- search | academic | safety | factcheck | synthesize | compile
  input TEXT,
  depends_on TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL, -- pending | ready | running | done | failed
  created_by TEXT NOT NULL, -- orchestrator | factchecker
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Evidence table
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  claim TEXT NOT NULL,
  source JSONB NOT NULL,
  agent TEXT NOT NULL,
  confidence NUMERIC(5, 4) NOT NULL, -- 0.0000 to 1.0000
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Claims table
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT NOT NULL, -- supported | partially_supported | unsupported | insufficient_evidence
  evidence_ids TEXT[] NOT NULL DEFAULT '{}',
  supported_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Payments (PaymentReceipt) table
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  amount_usdc NUMERIC(10, 6) NOT NULL,
  network TEXT NOT NULL DEFAULT 'eip155:84532',
  tx_hash TEXT NOT NULL,
  facilitator TEXT NOT NULL,
  purpose TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Budgets (SessionBudget) table
CREATE TABLE IF NOT EXISTS budgets (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  total_usdc NUMERIC(10, 6) NOT NULL,
  spent_usdc NUMERIC(10, 6) NOT NULL DEFAULT 0.0,
  max_fact_check_iterations INTEGER NOT NULL DEFAULT 2,
  max_dynamic_tasks INTEGER NOT NULL DEFAULT 3
);

-- 8. Events (SessionEvent) table
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- task_started | task_completed | payment_made | evidence_added | task_spawned | budget_capped | report_generated
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance and foreign key lookups
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_evidence_session_id ON evidence(session_id);
CREATE INDEX IF NOT EXISTS idx_claims_session_id ON claims(session_id);
CREATE INDEX IF NOT EXISTS idx_payments_session_id ON payments(session_id);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at ASC);
