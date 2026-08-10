// Shared TypeScript contracts (AGENTS.md Section 3)

export type TaskType = "search" | "academic" | "safety" | "factcheck" | "synthesize" | "compile";

export type TaskStatus = "pending" | "ready" | "running" | "done" | "failed";

export type SourceRef = {
  title: string;
  url: string;
  type: "web" | "academic" | "safety";
  paid: boolean;
};

export type TaskResult = {
  taskId: string;
  data: unknown;
  sources: SourceRef[];
  paymentReceiptId: string | null;
};

export type Task = {
  id: string;
  sessionId: string;
  type: TaskType;
  input: string | null;
  dependsOn: string[];
  status: TaskStatus;
  createdBy: "orchestrator" | "factchecker";
  result: TaskResult | null;
};

export type Evidence = {
  id: string;
  sessionId: string;
  claim: string;
  source: SourceRef;
  agent: string;
  confidence: number; // 0-1 deterministic score
};

export type ClaimStatus = "supported" | "partially_supported" | "unsupported" | "insufficient_evidence";

export type Claim = {
  id: string;
  sessionId: string;
  text: string;
  status: ClaimStatus;
  evidenceIds: string[];
  supportedText: string | null;
};

export type PaymentReceipt = {
  id: string;
  sessionId: string;
  agent: string;
  amountUsdc: number;
  network: "eip155:84532";
  txHash: string;
  facilitator: string;
  purpose: string;
  createdAt: string;
};

export type SessionBudget = {
  sessionId: string;
  totalUsdc: number;
  spentUsdc: number;
  maxFactCheckIterations: number;
  maxDynamicTasks: number;
};

export type SessionEventType =
  | "task_started"
  | "task_completed"
  | "payment_made"
  | "evidence_added"
  | "task_spawned"
  | "budget_capped"
  | "report_generated"
  | "task_failed";

export type SessionEvent = {
  id: string;
  sessionId: string;
  type: SessionEventType;
  payload: unknown;
  createdAt: string;
};

export type UserCredit = {
  userId: string;
  balanceUsd: number;
  updatedAt: string;
};
