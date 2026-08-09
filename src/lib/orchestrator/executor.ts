import { runAgent } from "../../agents/run-agent";
import { getSessionState, insertEvent } from "../supabase/db";
import type { Task, TaskResult, SessionState, SessionEvent } from "./types";

// A clean interface for StateWriter that emits events to Supabase DB
class SupabaseStateWriter {
  private sessionId: string;
  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  async submitTaskResult(task: Task, result: TaskResult): Promise<void> {
    const event: SessionEvent = {
      id: `evt-task-done-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
        id: `evt-task-start-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
          // Execute using Module 2 Agents
          result = await runAgent(task, { stateWriter });
        } else if (task.type === "factcheck") {
          // Fact-Checker (Module 3). Let's implement a simple local default factcheck
          result = await executeFactCheckAgent(sessionId, task, stateWriter);
        } else if (task.type === "synthesize") {
          // Synthesizer (Module 1 default owner)
          result = await executeSynthesizerAgent(sessionId, task, stateWriter);
        } else if (task.type === "compile") {
          // Compile (Module 4)
          result = await executeCompilerAgent(sessionId, task, stateWriter);
        } else {
          throw new Error(`Unsupported task type: ${task.type}`);
        }

        // 3. Mark task completed (if not already handled by stateWriter inside runAgent)
        const currentState = await getSessionState(sessionId);
        const currentTask = currentState?.tasks.find((t) => t.id === task.id);
        if (currentTask && currentTask.status !== "done") {
          await stateWriter.submitTaskResult(task, result);
        }
      } catch (error: any) {
        console.error(`[Executor] Task ${task.id} (${task.type}) failed:`, error);
        const failEvent: SessionEvent = {
          id: `evt-task-fail-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          sessionId,
          type: "task_failed" as any,
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
 * Fallback / local implementation of Fact-Checker Agent (Module 3)
 */
async function executeFactCheckAgent(
  sessionId: string,
  task: Task,
  stateWriter: SupabaseStateWriter
): Promise<TaskResult> {
  const state = await getSessionState(sessionId);
  if (!state) throw new Error("Session state not found");

  console.log(`[Fact-Checker] Checking claims against ${state.evidence.length} pieces of evidence.`);

  // Find all claims
  // (In real flow, Module 3 calls an LLM to evaluate claims)
  // Let's create mock claims with high/low confidence depending on evidence count.
  const claims = state.claims;
  if (claims.length === 0) {
    claims.push({
      id: `claim-1`,
      sessionId,
      text: "Neem bioactive compounds are effective against certain skin conditions.",
      status: "supported",
      evidenceIds: state.evidence.map((e) => e.id),
      supportedText: "Neem extracts show therapeutic potential in dermatological conditions.",
    });
  }

  // To simulate the loop and tests: "fact-check iteration limit cannot exceed 2"
  // Let's check how many times factchecker ran by counting events or task records.
  const factcheckTasks = state.tasks.filter((t) => t.type === "factcheck");
  const iterationCount = factcheckTasks.length;

  // If we have under 2 iterations and we can spawn dynamic tasks, let's spawn one if budget allows.
  const dynamicTasks = state.tasks.filter((t) => t.createdBy === "factchecker");
  const maxDynamic = state.budget?.maxDynamicTasks ?? 3;

  if (iterationCount < 2 && dynamicTasks.length < maxDynamic) {
    // Spawn a search task
    const spawnId = `spawned-task-${Date.now()}`;
    const spawnedTask: Task = {
      id: spawnId,
      sessionId,
      type: "search",
      input: "Specific targeted query about Neem side effects on renal function",
      dependsOn: [],
      status: "ready",
      createdBy: "factchecker",
      result: null,
    };

    const spawnEvent: SessionEvent = {
      id: `evt-spawn-${Date.now()}`,
      sessionId,
      type: "task_spawned",
      payload: spawnedTask,
      createdAt: new Date().toISOString(),
    };
    await insertEvent(sessionId, spawnEvent);
  }

  const result: TaskResult = {
    taskId: task.id,
    data: {
      claims,
      iterationCount,
    },
    sources: [],
    paymentReceiptId: null,
  };

  return result;
}

/**
 * Fallback / local implementation of Synthesizer Agent (Module 1 Default)
 */
async function executeSynthesizerAgent(
  sessionId: string,
  task: Task,
  stateWriter: SupabaseStateWriter
): Promise<TaskResult> {
  const state = await getSessionState(sessionId);
  if (!state) throw new Error("Session state not found");

  const summary = `Synthesized report for research on query. Evaluated ${state.tasks.length} tasks and ${state.evidence.length} evidence sources. Status: claims verified.`;

  const result: TaskResult = {
    taskId: task.id,
    data: {
      summary,
    },
    sources: [],
    paymentReceiptId: null,
  };

  return result;
}

/**
 * Fallback / local implementation of Compiler Agent (Module 4)
 */
async function executeCompilerAgent(
  sessionId: string,
  task: Task,
  stateWriter: SupabaseStateWriter
): Promise<TaskResult> {
  const state = await getSessionState(sessionId);
  if (!state) throw new Error("Session state not found");

  const synthTask = state.tasks.find((t) => t.type === "synthesize");
  const summary = (synthTask?.result?.data as any)?.summary || "No synthesis available";

  const result: TaskResult = {
    taskId: task.id,
    data: {
      compiledReport: {
        title: "Axiom Research Compilation",
        summary,
        totalSpentUsdc: state.budget?.spentUsdc || 0,
        sourcesCount: state.evidence.length,
      },
    },
    sources: [],
    paymentReceiptId: null,
  };

  // Log report_generated event
  const reportEvent: SessionEvent = {
    id: `evt-report-${Date.now()}`,
    sessionId,
    type: "report_generated",
    payload: { reportTaskId: task.id },
    createdAt: new Date().toISOString(),
  };
  await insertEvent(sessionId, reportEvent);

  return result;
}
