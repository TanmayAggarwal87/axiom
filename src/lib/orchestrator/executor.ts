import { runAgent } from "../../agents/run-agent";
import { getSessionState, insertEvent, saveSessionReport, getSessionUserId, markSessionFailed } from "../supabase/db";
import { payAndFetch } from "../x402/payAndFetch";
import { runFactChecker } from "../agents/factChecker";
import { compileReport } from "../report/compiler";
import type { Task, TaskResult, SessionState, SessionEvent, Evidence, Claim } from "./types";

// ─── Circuit Breaker Defaults ──────────────────────────────────────────────
const MAX_SESSION_WALL_CLOCK_MS = parseInt(process.env.MAX_SESSION_WALL_CLOCK_MS || "120000", 10); // 120s
const MAX_LLM_CALLS_PER_SESSION = parseInt(process.env.MAX_LLM_CALLS || "25", 10);
const MAX_TAVILY_CALLS_PER_SESSION = parseInt(process.env.MAX_TAVILY_CALLS || "15", 10);
const MAX_LOOP_ITERATIONS = parseInt(process.env.MAX_LOOP_ITERATIONS || "50", 10);

const DEBUG = process.env.DEBUG_ORCHESTRATOR === "true";

function debugLog(...args: unknown[]) {
  if (DEBUG) console.log("[DEBUG_ORCHESTRATOR]", ...args);
}

// ─── Session-level call counters (shared across one executeSession invocation) ──
type SessionCounters = {
  llmCalls: number;
  tavilyCalls: number;
  loopIterations: number;
  startTime: number;
};

function checkCircuitBreaker(counters: SessionCounters, sessionId: string): string | null {
  const elapsed = Date.now() - counters.startTime;
  if (elapsed > MAX_SESSION_WALL_CLOCK_MS) {
    return `Wall-clock timeout: ${elapsed}ms > ${MAX_SESSION_WALL_CLOCK_MS}ms`;
  }
  if (counters.llmCalls > MAX_LLM_CALLS_PER_SESSION) {
    return `LLM call limit: ${counters.llmCalls} > ${MAX_LLM_CALLS_PER_SESSION}`;
  }
  if (counters.tavilyCalls > MAX_TAVILY_CALLS_PER_SESSION) {
    return `Tavily call limit: ${counters.tavilyCalls} > ${MAX_TAVILY_CALLS_PER_SESSION}`;
  }
  if (counters.loopIterations > MAX_LOOP_ITERATIONS) {
    return `Loop iteration limit: ${counters.loopIterations} > ${MAX_LOOP_ITERATIONS}`;
  }
  return null;
}

// ─── State Writer (executor-owned, not passed to agents) ────────────────────
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
 * Gracefully terminate a session: mark all non-terminal tasks as failed,
 * log a budget_capped event with the reason.
 */
async function gracefulShutdown(
  sessionId: string,
  reason: string,
  counters: SessionCounters
): Promise<SessionState> {
  console.warn(`[Executor] CIRCUIT BREAKER TRIPPED for session ${sessionId}: ${reason}`);
  debugLog("Circuit breaker details:", {
    reason,
    llmCalls: counters.llmCalls,
    tavilyCalls: counters.tavilyCalls,
    loopIterations: counters.loopIterations,
    elapsedMs: Date.now() - counters.startTime,
  });

  // Log budget_capped event
  const capEvent: SessionEvent = {
    id: `evt-cap-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    sessionId,
    type: "budget_capped",
    payload: {
      reason,
      llmCalls: counters.llmCalls,
      tavilyCalls: counters.tavilyCalls,
      loopIterations: counters.loopIterations,
      elapsedMs: Date.now() - counters.startTime,
      maxFactCheckIterations: 0, // caps zeroed to prevent further work
      maxDynamicTasks: 0,
    },
    createdAt: new Date().toISOString(),
  };
  await insertEvent(sessionId, capEvent);

  // Fail all non-terminal tasks
  const state = await getSessionState(sessionId);
  if (state) {
    for (const task of state.tasks) {
      if (task.status !== "done" && task.status !== "failed") {
        const failEvent: SessionEvent = {
          id: `evt-task-fail-cb-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          sessionId,
          type: "task_failed",
          payload: { taskId: task.id, error: `Circuit breaker: ${reason}` },
          createdAt: new Date().toISOString(),
        };
        await insertEvent(sessionId, failEvent);
      }
    }
  }

  // Try to run synthesize + compile with whatever evidence exists
  try {
    await runSynthesizeAndCompile(sessionId);
  } catch (err) {
    console.error("[Executor] Failed to run synthesis after circuit breaker:", err);
  }

  return (await getSessionState(sessionId))!;
}

/**
 * Run synthesize + compile tasks if they haven't already run.
 * Used both in normal flow (when factcheck finishes) and in graceful shutdown.
 */
async function runSynthesizeAndCompile(sessionId: string): Promise<void> {
  const state = await getSessionState(sessionId);
  if (!state) return;

  const stateWriter = new SupabaseStateWriter(sessionId);

  // Find synthesize task — if it exists and hasn't run, execute it
  const synthTask = state.tasks.find((t) => t.type === "synthesize" && t.status !== "done" && t.status !== "failed");
  if (synthTask) {
    const startEvent: SessionEvent = {
      id: `evt-task-start-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      sessionId,
      type: "task_started",
      payload: { taskId: synthTask.id },
      createdAt: new Date().toISOString(),
    };
    await insertEvent(sessionId, startEvent);

    try {
      const result = await executeSynthesizerAgent(sessionId, synthTask);
      await stateWriter.submitTaskResult(synthTask, result);
    } catch (err) {
      const failEvent: SessionEvent = {
        id: `evt-task-fail-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        sessionId,
        type: "task_failed",
        payload: { taskId: synthTask.id, error: (err as Error).message },
        createdAt: new Date().toISOString(),
      };
      await insertEvent(sessionId, failEvent);
    }
  }

  // Same for compile task
  const freshState = await getSessionState(sessionId);
  if (!freshState) return;
  const compileTask = freshState.tasks.find((t) => t.type === "compile" && t.status !== "done" && t.status !== "failed");
  if (compileTask) {
    const startEvent: SessionEvent = {
      id: `evt-task-start-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      sessionId,
      type: "task_started",
      payload: { taskId: compileTask.id },
      createdAt: new Date().toISOString(),
    };
    await insertEvent(sessionId, startEvent);

    try {
      const result = await executeCompilerAgent(sessionId, compileTask);
      await stateWriter.submitTaskResult(compileTask, result);
    } catch (err) {
      const failEvent: SessionEvent = {
        id: `evt-task-fail-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        sessionId,
        type: "task_failed",
        payload: { taskId: compileTask.id, error: (err as Error).message },
        createdAt: new Date().toISOString(),
      };
      await insertEvent(sessionId, failEvent);
    }
  }
}

/**
 * Main Task Executor. Resolves dependencies and executes tasks in parallel.
 * Includes circuit breakers for wall-clock time, LLM calls, Tavily calls, and loop iterations.
 */
export async function executeSession(sessionId: string): Promise<SessionState> {
  try {
    const stateWriter = new SupabaseStateWriter(sessionId);
    const counters: SessionCounters = {
      llmCalls: 0,
      tavilyCalls: 0,
      loopIterations: 0,
      startTime: Date.now(),
    };

  while (true) {
    counters.loopIterations++;

    // Check circuit breaker at the top of every loop iteration
    const breakerReason = checkCircuitBreaker(counters, sessionId);
    if (breakerReason) {
      return gracefulShutdown(sessionId, breakerReason, counters);
    }

    const state = await getSessionState(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const tasks = state.tasks;
    const readyTasks = tasks.filter((t) => t.status === "ready");
    const runningTasks = tasks.filter((t) => t.status === "running");

    debugLog(`Loop iteration #${counters.loopIterations} | tasks:`, {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === "pending").length,
      ready: readyTasks.length,
      running: runningTasks.length,
      done: tasks.filter((t) => t.status === "done").length,
      failed: tasks.filter((t) => t.status === "failed").length,
      llmCalls: counters.llmCalls,
      tavilyCalls: counters.tavilyCalls,
    });

    // If no tasks are ready and none are running, we are done (or stuck)
    if (readyTasks.length === 0 && runningTasks.length === 0) {
      debugLog("No ready or running tasks — exiting loop.");
      return state;
    }

    // If no tasks are ready but some are running, wait a bit and re-check
    if (readyTasks.length === 0 && runningTasks.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }

    // --- Check if gathering agents are all done and factcheck hasn't been injected yet ---
    const gatheringTypes = ["search", "academic", "safety"];
    const gatheringTasks = tasks.filter((t) => gatheringTypes.includes(t.type));
    const allGatheringDone = gatheringTasks.length > 0 && gatheringTasks.every((t) => t.status === "done" || t.status === "failed");
    const hasFactcheck = tasks.some((t) => t.type === "factcheck");

    if (allGatheringDone && !hasFactcheck) {
      debugLog("All gathering agents done, injecting factcheck task.");
      const synthTask = tasks.find((t) => t.type === "synthesize");
      const factcheckTask: Task = {
        id: `task-factcheck-${Date.now()}`,
        sessionId,
        type: "factcheck",
        input: "Verify all claims gathered by search, academic, and safety agents.",
        dependsOn: gatheringTasks.filter((t) => t.status === "done").map((t) => t.id),
        status: "ready", // All deps are done, so it's ready
        createdBy: "orchestrator",
        result: null,
      };

      const spawnEvent: SessionEvent = {
        id: `evt-spawn-fc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        sessionId,
        type: "task_spawned",
        payload: factcheckTask,
        createdAt: new Date().toISOString(),
      };
      await insertEvent(sessionId, spawnEvent);

      // Update synthesize task to also depend on factcheck
      if (synthTask && synthTask.status === "pending") {
        // We can't modify dependsOn directly in DB easily, so synthesize will be promoted
        // when factcheck completes via the reducer's updatePendingTasks
        debugLog("Synthesize task will wait for factcheck via dependency update.");
      }

      continue; // Re-enter loop to pick up the new factcheck task
    }

    // Launch all ready tasks in parallel
    console.log(`[Executor] Launching ${readyTasks.length} ready tasks for session ${sessionId}...`);
    const launchPromises = readyTasks.map(async (task) => {
      debugLog(`Dispatching task ${task.id} (${task.type}), createdBy=${task.createdBy}`);

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
          // Track API calls: each gathering agent does 1 Gemini refine + 1 Tavily search + 1 Gemini extract = 2 LLM + 1 Tavily
          counters.llmCalls += 2;
          counters.tavilyCalls += 1;

          // Execute using Module 2 Agents — NO stateWriter passed (executor handles state)
          result = await runAgent(task, {
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
            // NOTE: No stateWriter — executor handles submitTaskResult exclusively
          });
        } else if (task.type === "factcheck") {
          // Fact-Checker (Module 3)
          counters.llmCalls += 1; // Gemini hedging call
          result = await executeFactCheckAgent(sessionId, task);
        } else if (task.type === "synthesize") {
          // Synthesizer
          counters.llmCalls += 1;
          result = await executeSynthesizerAgent(sessionId, task);
        } else if (task.type === "compile") {
          // Report Compiler (Module 4)
          result = await executeCompilerAgent(sessionId, task);
        } else {
          throw new Error(`Unsupported task type: ${task.type}`);
        }

        // 3. Executor exclusively marks task completed — no double-dispatch
        debugLog(`Task ${task.id} (${task.type}) completed, writing result.`);
        await stateWriter.submitTaskResult(task, result);
      } catch (error: any) {
        console.error(`[Executor] Task ${task.id} (${task.type}) failed:`, error);
        debugLog(`Task ${task.id} FAILED:`, error?.message);
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
  } catch (err) {
    console.error(`[executeSession Error] Session ${sessionId}:`, err);
    await markSessionFailed(sessionId);
    throw err;
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

  debugLog("Fact-checker invoked:", {
    currentIteration,
    dynamicTasksSpawned,
    maxFactCheckIterations: state.budget?.maxFactCheckIterations,
    maxDynamicTasks: state.budget?.maxDynamicTasks,
    claimsCount: state.claims.length,
    evidenceCount: state.evidence.length,
  });

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

  debugLog("Fact-checker result:", {
    iterationsUsed: fcResult.iterationsUsed,
    capReached: fcResult.capReached,
    newEvidenceCount: fcResult.newEvidence.length,
    receiptsCount: fcResult.receipts.length,
    spawnedTasksCount: fcResult.spawnedTasks.length,
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

  const apiKey = process.env.GEMINI_API_KEY_3 || process.env.GEMINI_API_KEY;
  if (apiKey && !apiKey.includes("your-gemini")) {
    try {
      const evidenceText = state.evidence
        .map((e) => `- Claim: "${e.claim}" (Source: ${e.source.title}, URL: ${e.source.url}, Confidence: ${e.confidence})`)
        .join("\n");
      const claimsText = state.claims
        .map((c) => `- [${c.status}] ${c.text}${c.supportedText ? ` (Verified note: ${c.supportedText})` : ""}`)
        .join("\n");

      const prompt = `You are a Lead Synthesizer for Axiom, an autonomous AI research system. Write a comprehensive, in-depth executive summary for the research query: "${rawQuery}".

Requirements:
- Write a comprehensive executive summary of at least 400–600 words that synthesizes the key findings across all research areas, not a brief abstract.
- Thoroughly integrate the evidence and claims gathered below into a cohesive, structured narrative with multiple detailed paragraphs.
- Highlight key empirical findings, clinical or academic evidence, safety profiles, contraindications, and practical implications.

Evidence Gathered (${state.evidence.length} sources):
${evidenceText || "No evidence recorded."}

Verified Claims (${state.claims.length}):
${claimsText || "No claims recorded."}

Provide a detailed, multi-paragraph synthesis.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 2500,
              temperature: 0.3,
            },
          }),
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

  // Persist the compiled report and set status to completed
  const userId = (await getSessionUserId(sessionId)) || "default-user";
  try {
    await saveSessionReport(sessionId, userId, compiledReport);
  } catch (err) {
    console.error("[Executor] Failed to save session report:", err);
  }

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
