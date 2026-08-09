/**
 * TEMPORARY COORDINATED SHARED CONTRACTS
 * 
 * IMPORTANT INTEGRATION NOTICE:
 * 1. This file is a temporary coordinated shared contract location based on AGENTS.md Section 3.
 * 2. Module 1 will become the canonical owner of shared state/database contracts.
 * 3. When the final canonical contract location is agreed upon, update this single boundary file
 *    (or re-export Module 1's definitions from here) rather than duplicating types across modules.
 * 
 * Do not alter the contract shapes defined below without team consensus.
 */

// A single unit of work in the research plan
export type Task = {
  id: string;
  sessionId: string;
  type: "search" | "academic" | "safety" | "factcheck" | "synthesize" | "compile";
  input: string | null;
  dependsOn: string[];       // ids of tasks that must complete first
  status: "pending" | "ready" | "running" | "done" | "failed";
  createdBy: "orchestrator" | "factchecker"; // factchecker = dynamically spawned task
  result: TaskResult | null;
};

export type TaskResult = {
  taskId: string;
  data: unknown;             // shape depends on task type
  sources: SourceRef[];
  paymentReceiptId: string | null; // set if this task involved an x402 payment
};

export type SourceRef = {
  title: string;
  url: string;
  type: "web" | "academic" | "safety";
  paid: boolean;
};

export type Evidence = {
  id: string;
  sessionId: string;
  claim: string;
  source: SourceRef;
  agent: string;
  confidence: number;        // 0–1, deterministic score calculated by Fact-Checker in Module 3
};

export type Claim = {
  id: string;
  sessionId: string;
  text: string;
  status: "supported" | "partially_supported" | "unsupported" | "insufficient_evidence";
  evidenceIds: string[];
  supportedText: string | null; // fact-checker's corrected/hedged version, if different
};

export type PaymentReceipt = {
  id: string;
  sessionId: string;
  agent: string;
  amountUsdc: number;
  network: "eip155:84532";   // Base Sepolia — hardcode for this project
  txHash: string;
  facilitator: string;
  purpose: string;
  createdAt: string;
};

export type SessionBudget = {
  sessionId: string;
  totalUsdc: number;         // carved out of the user's credit wallet at session start
  spentUsdc: number;
  maxFactCheckIterations: number;  // hard cap, default 2
  maxDynamicTasks: number;         // hard cap, default 3
};

export type SessionEvent = {
  id: string;
  sessionId: string;
  type: "task_started" | "task_completed" | "payment_made" | "evidence_added" |
        "task_spawned" | "budget_capped" | "report_generated";
  payload: unknown;
  createdAt: string;
};
