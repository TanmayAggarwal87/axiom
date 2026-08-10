import { runAgent } from "../../agents/run-agent";
import { getSessionState, insertEvent } from "../supabase/db";
import { payAndFetch } from "../x402/payAndFetch";
import { runFactChecker } from "../agents/factChecker";
import { compileReport } from "../report/compiler";
import type { Task, TaskResult, SessionState, SessionEvent, Evidence, Claim } from "./types";

// A clean interface for StateWriter that emits events to Supabase DB
class SupabaseStateWriter {
  private sessionId: string;
  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  async submitTaskResult(task: Task, result: TaskResult): Promise<void> {
    // If gathering agent returned findings, convert them to Evidence & Claim events
    const data = result.data as any;
    if (data?.findings && Array.isArray(data.findings)) {
      for (const f of data.findings) {
        if (f.claim && f.source) {
          const evId = `ev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const evidenceObj: Evidence = {
            id: evId,
            sessionId: this.sessionId,
            claim: f.claim,
            source: f.source,
            agent: task.type,
            confidence: task.type === "academic" ? 0.9 : task.type === "safety" ? 0.85 : 0.7,
          };

          const claimId = `claim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const claimObj: Claim = {
            id: claimId,
            sessionId: this.sessionId,
            text: f.claim,
            status: "supported",
            evidenceIds: [evId],
            supportedText: f.claim,
          };

          const evEvent: SessionEvent = {
            id: `evt-ev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            sessionId: this.sessionId,
            type: "evidence_added",
            payload: { evidence: evidenceObj, claim: claimObj },
            createdAt: new Date().toISOString(),
          };
          await insertEvent(this.sessionId, evEvent);
        }
      }
    }

    const event: SessionEvent = {
      id: `evt-task-done-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      sessionId: this.sessionId,
      type: "task_completed",
      payload: {
        taskId: task.id,
        result,
      },
      createdAt: new Date().toISOString(),
    };
    await insertEvent(this.sessionId, event);
  }
}

/**
 * Main Task Executor. Resolves dependencies and executes tasks in parallel.
 */
export async function executeSession(sessionId: string): Promise<SessionState> {
  const stateWriter = new SupabaseStateWriter(sessionId);

  while (true) {
    const state = await getSessionState(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const tasks = state.tasks;
    const readyTasks = tasks.filter((t) => t.status === "ready");
    const runningTasks = tasks.filter((t) => t.status === "running");

    // If no tasks are ready and none are running, we are done (or stuck)
    if (readyTasks.length === 0 && runningTasks.length === 0) {
      return state;
    }

    // If no tasks are ready but some are running, wait a bit and re-check
    if (readyTasks.length === 0 && runningTasks.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }

    // Launch all ready tasks in parallel
    console.log(`[Executor] Launching ${readyTasks.length} ready tasks for session ${sessionId}...`);
    const launchPromises = readyTasks.map(async (task) => {
      // 1. Mark task as started
      const startEvent: SessionEvent = {
        id: `evt-task-start-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        sessionId,
        type: "task_started",
        payload: { taskId: task.id },
        createdAt: new Date().toISOString(),
      };
      await insertEvent(sessionId, startEvent);

      try {
        let result: TaskResult;

        // 2. Dispatch based on type
        if (task.type === "search" || task.type === "academic" || task.type === "safety") {
          // Execute using Module 2 Agents with real x402 payAndFetch
          result = await runAgent(task, {
            stateWriter,
            paidFetcher: {
              payAndFetch: async <T = any>(url: string, opts: any) => {
                const res = await payAndFetch<T>(url, opts);
                if (res.receipt) {
                  const payEv: SessionEvent = {
                    id: `evt-pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    sessionId,
                    type: "payment_made",
                    payload: res.receipt,
                    createdAt: new Date().toISOString(),
                  };
                  await insertEvent(sessionId, payEv);
                }
                return {
                  data: res.data,
                  receipt: res.receipt,
                  paymentReceiptId: res.receipt?.id || null,
                  response: res.response,
                };
              },
            },
          });
        } else if (task.type === "factcheck") {
          // Fact-Checker (Module 3)
          result = await executeFactCheckAgent(sessionId, task);
        } else if (task.type === "synthesize") {
          // Synthesizer (Module 1/2)
          result = await executeSynthesizerAgent(sessionId, task);
        } else if (task.type === "compile") {
          // Report Compiler (Module 4)
          result = await executeCompilerAgent(sessionId, task);
        } else {
          throw new Error(`Unsupported task type: ${task.type}`);
        }

        // 3. Mark task completed (if not already handled by stateWriter)
        const currentState = await getSessionState(sessionId);
        const currentTask = currentState?.tasks.find((t) => t.id === task.id);
        if (currentTask && currentTask.status !== "done") {
          await stateWriter.submitTaskResult(task, result);
        }
      } catch (error: any) {
        console.error(`[Executor] Task ${task.id} (${task.type}) failed:`, error);
        const failEvent: SessionEvent = {
          id: `evt-task-fail-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          sessionId,
          type: "task_failed",
          payload: { taskId: task.id, error: error?.message || "Execution failed" },
          createdAt: new Date().toISOString(),
        };
        await insertEvent(sessionId, failEvent);
      }
    });

    await Promise.all(launchPromises);
  }
}

/**
 * Real implementation of Fact-Checker Agent (Module 3)
 */
async function executeFactCheckAgent(
  sessionId: string,
  task: Task
): Promise<TaskResult> {
  const state = await getSessionState(sessionId);
  if (!state) throw new Error("Session state not found");

  const factcheckTasks = state.tasks.filter((t) => t.type === "factcheck");
  const currentIteration = factcheckTasks.length;
  const dynamicTasksSpawned = state.tasks.filter((t) => t.createdBy === "factchecker").length;

  const verificationEndpoint = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/x402-resource`
    : "http://localhost:3000/api/x402-resource";

  const fcResult = await runFactChecker({
    sessionId,
    claims: state.claims,
    evidence: state.evidence,
    budget: state.budget || undefined,
    verificationEndpoint,
    currentIteration,
    dynamicTasksSpawned,
  });

  // Write any payment receipts generated by fact-checker to event log
  for (const rcpt of fcResult.receipts) {
    const payEv: SessionEvent = {
      id: `evt-pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sessionId,
      type: "payment_made",
      payload: rcpt,
      createdAt: new Date().toISOString(),
    };
    await insertEvent(sessionId, payEv);
  }

  // Write new evidence to event log
  for (const ev of fcResult.newEvidence) {
    const evEv: SessionEvent = {
      id: `evt-ev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sessionId,
      type: "evidence_added",
      payload: { evidence: ev },
      createdAt: new Date().toISOString(),
    };
    await insertEvent(sessionId, evEv);
  }

  // Write spawned tasks to event log
  for (const spawned of fcResult.spawnedTasks) {
    const spawnEv: SessionEvent = {
      id: `evt-spawn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sessionId,
      type: "task_spawned",
      payload: spawned,
      createdAt: new Date().toISOString(),
    };
    await insertEvent(sessionId, spawnEv);
  }

  return {
    taskId: task.id,
    data: {
      claims: fcResult.claims,
      iterationsUsed: fcResult.iterationsUsed,
      capReached: fcResult.capReached,
    },
    sources: [],
    paymentReceiptId: fcResult.receipts[0]?.id || null,
  };
}

/**
 * Real implementation of Synthesizer Agent (Gemini driven)
 */
async function executeSynthesizerAgent(
  sessionId: string,
  task: Task
): Promise<TaskResult> {
  const state = await getSessionState(sessionId);
  if (!state) throw new Error("Session state not found");

  const queryTask = state.tasks.find((t) => t.input);
  const rawQuery = queryTask?.input || "Research topic";

  let summary = "";

  if (process.env.GEMINI_API_KEY_3 && !process.env.GEMINI_API_KEY_3.includes("your-gemini")) {
    try {
      const prompt = `Synthesize a concise executive summary for research query: "${rawQuery}".
Evidence gathered (${state.evidence.length} sources):
${state.evidence.map((e) => `- ${e.claim} (Source: ${e.source.title}, Conf: ${e.confidence})`).join("\n")}

Provide a coherent 2-3 paragraph summary.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY_3}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );

      if (response.ok) {
        const json = await response.json();
        summary = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      }
    } catch (err) {
      console.warn("[Synthesizer] Gemini call fallback:", err);
    }
  }

  if (!summary) {
    summary = `Synthesized executive summary for research query: "${rawQuery}". Analyzed ${state.evidence.length} evidence records across search, academic, and safety streams. Verified ${state.claims.length} claims with total spent of $${(state.budget?.spentUsdc || 0).toFixed(4)} USDC on Base Sepolia.`;
  }

  return {
    taskId: task.id,
    data: { summary },
    sources: [],
    paymentReceiptId: null,
  };
}

/**
 * Real implementation of Compiler Agent (Module 4)
 */
async function executeCompilerAgent(
  sessionId: string,
  task: Task
): Promise<TaskResult> {
  const state = await getSessionState(sessionId);
  if (!state) throw new Error("Session state not found");

  const firstTask = state.tasks[0];
  const query = firstTask?.input || "Research Topic";

  const compiledReport = compileReport(state, query);

  // Log report_generated event
  const reportEvent: SessionEvent = {
    id: `evt-report-${Date.now()}`,
    sessionId,
    type: "report_generated",
    payload: { reportTaskId: task.id },
    createdAt: new Date().toISOString(),
  };
  await insertEvent(sessionId, reportEvent);

  return {
    taskId: task.id,
    data: { compiledReport },
    sources: [],
    paymentReceiptId: null,
  };
}
