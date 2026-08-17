import type { SessionState, SessionEvent, Task, Evidence, Claim, PaymentReceipt, SessionBudget } from "./types";

/**
 * Event-sourced reducer to derive current state from a sequence of events.
 * Processes events in order. Does NOT perform any I/O.
 */
export function stateReducer(state: SessionState, event: SessionEvent): SessionState {
  // Deep clone state to avoid mutating original objects
  const nextState: SessionState = JSON.parse(JSON.stringify(state));
  nextState.events.push(event);

  switch (event.type) {
    case "task_started": {
      const payload = event.payload as { taskId: string };
      const task = nextState.tasks.find((t) => t.id === payload.taskId);
      if (task) {
        task.status = "running";
      }
      break;
    }

    case "task_completed": {
      const payload = event.payload as { taskId: string; result: any };
      const task = nextState.tasks.find((t) => t.id === payload.taskId);
      if (task) {
        task.status = "done";
        task.result = payload.result;

        // If this is a factcheck task, update the claims list if present in result data
        if (task.type === "factcheck" && payload.result?.data) {
          const resultData = payload.result.data as { claims?: Claim[] };
          if (Array.isArray(resultData.claims)) {
            for (const newClaim of resultData.claims) {
              const existingIdx = nextState.claims.findIndex((c) => c.id === newClaim.id);
              if (existingIdx >= 0) {
                nextState.claims[existingIdx] = newClaim;
              } else {
                nextState.claims.push(newClaim);
              }
            }
          }
        }
      }

      // Automatically update status of pending tasks whose dependencies are now fully met
      updatePendingTasks(nextState.tasks);
      break;
    }

    case "payment_made": {
      const receipt = event.payload as PaymentReceipt;
      // Add payment receipt if not already present
      if (!nextState.payments.some((p) => p.id === receipt.id)) {
        nextState.payments.push(receipt);
      }
      // Update budget spentUsdc
      if (nextState.budget) {
        nextState.budget.spentUsdc = Number((nextState.budget.spentUsdc + receipt.amountUsdc).toFixed(6));
      }
      break;
    }

    case "evidence_added": {
      // payload can be a direct Evidence object or wrapped with an associated Claim
      const payload = event.payload as any;
      let evidenceObj: Evidence | null = null;
      let claimObj: Claim | null = null;

      if (payload && typeof payload === "object") {
        if ("evidence" in payload) {
          evidenceObj = payload.evidence as Evidence;
          if (payload.claim) {
            claimObj = payload.claim as Claim;
          }
        } else if ("claim" in payload && !("evidence" in payload)) {
          // just a claim update
          claimObj = payload as unknown as Claim;
        } else {
          evidenceObj = payload as Evidence;
        }
      }

      if (evidenceObj && !nextState.evidence.some((e) => e.id === evidenceObj!.id)) {
        nextState.evidence.push(evidenceObj);
      }

      if (claimObj) {
        const existingIdx = nextState.claims.findIndex((c) => c.id === claimObj!.id);
        if (existingIdx >= 0) {
          nextState.claims[existingIdx] = claimObj;
        } else {
          nextState.claims.push(claimObj);
        }
      }
      break;
    }

    case "task_spawned": {
      const task = event.payload as Task;
      if (!nextState.tasks.some((t) => t.id === task.id)) {
        // Double check limits (max dynamic tasks = 3)
        const dynamicTasksCount = nextState.tasks.filter((t) => t.createdBy === "factchecker").length;
        const limit = nextState.budget?.maxDynamicTasks ?? 3;
        if (dynamicTasksCount < limit) {
          nextState.tasks.push(task);
        } else {
          console.warn(`[Reducer] Task spawn rejected: dynamic task limit (${limit}) exceeded.`);
        }
      }
      updatePendingTasks(nextState.tasks);
      break;
    }

    case "budget_capped": {
      const payload = event.payload as { maxFactCheckIterations: number; maxDynamicTasks: number };
      if (nextState.budget) {
        nextState.budget.maxFactCheckIterations = payload.maxFactCheckIterations;
        nextState.budget.maxDynamicTasks = payload.maxDynamicTasks;
      }
      break;
    }

    case "report_generated": {
      // No state derivation needed here for now
      break;
    }

    case "task_failed": {
      const payload = event.payload as { taskId: string; error?: string };
      const task = nextState.tasks.find((t) => t.id === payload.taskId);
      if (task) {
        task.status = "failed";
      }
      break;
    }
  }

  return nextState;
}

/**
 * Updates any pending tasks to "ready" status if their dependencies are done.
 */
function updatePendingTasks(tasks: Task[]): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (task.status === "pending") {
        const allDepsDone = task.dependsOn.every((depId) => {
          const depTask = tasks.find((t) => t.id === depId);
          return depTask && depTask.status === "done";
        });
        if (allDepsDone) {
          task.status = "ready";
          changed = true;
        }
      }
    }
  }
}
