import type {
  Task,
  TaskResult,
  SourceRef,
  Evidence,
  Claim,
  PaymentReceipt,
  SessionBudget,
  SessionEvent,
} from "../../types/shared";

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

export type SessionState = {
  sessionId: string;
  tasks: Task[];
  evidence: Evidence[];
  claims: Claim[];
  budget: SessionBudget | null;
  payments: PaymentReceipt[];
  events: SessionEvent[];
};
