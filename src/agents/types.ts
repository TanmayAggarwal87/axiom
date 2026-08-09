// Module 2 Types & Re-exported Shared Contracts
import type {
  Task,
  TaskResult,
  SourceRef,
  Evidence,
  Claim,
  PaymentReceipt,
  SessionBudget,
  SessionEvent,
} from "../types/shared";

export type {
  Task,
  TaskResult,
  SourceRef,
  Evidence,
  Claim,
  PaymentReceipt,
  SessionBudget,
  SessionEvent,
};

// Module 2 Internal Findings Shapes

export type AgentFinding = {
  claim: string;
  source: SourceRef;
  excerpt?: string;
};

export type AgentOutputData = {
  findings: AgentFinding[];
  refinedQuery: string;
  summary: string;
};
