import type { Task, TaskResult } from "../types";

/**
 * Module 1 Integration Boundary for Event-Sourced Task Results.
 * 
 * ARCHITECTURAL FLOW IN PRODUCTION:
 * ==============================================================================
 * Module 2 Agent
 *     ↓
 * StateWriter (this interface)
 *     ↓
 * Module 1 Event API
 *     ↓
 * SessionEvent Creation (written to events table)
 *     ↓
 * Module 1 Reducer
 *     ↓
 * Derived Task / Evidence State (persisted to DB)
 * ==============================================================================
 * 
 * CRITICAL RULE:
 * Module 2 agents must NOT write directly to Supabase tables, update task rows,
 * insert Evidence rows, or mutate session state. All state changes flow through
 * Module 1's event reducer to prevent race conditions during parallel execution.
 */
export interface StateWriter {
  submitTaskResult(task: Task, result: TaskResult): Promise<void>;
}
