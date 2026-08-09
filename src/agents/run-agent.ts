import type { Task, TaskResult } from "./types";
import type { PaidFetcher } from "./adapters/paid-fetcher";
import type { StateWriter } from "./adapters/state-writer";
import { executeSearchAgent } from "./search-agent";
import { executeSafetyAgent } from "./safety-agent";
import { executeAcademicAgent } from "./academic-agent";

export type RunAgentDependencies = {
  paidFetcher?: PaidFetcher;
  stateWriter?: StateWriter;
  forcePaidFetchUrl?: string;
};

/**
 * Universal dispatcher for Module 2 information-gathering agents.
 * 
 * Validates task type, dispatches to SearchAgent, SafetyAgent, or AcademicAgent,
 * and submits result via StateWriter adapter if provided.
 */
export async function runAgent(
  task: Task,
  dependencies?: RunAgentDependencies
): Promise<TaskResult> {
  let result: TaskResult;

  switch (task.type) {
    case "search":
      result = await executeSearchAgent(task);
      break;

    case "safety":
      result = await executeSafetyAgent(task);
      break;

    case "academic":
      result = await executeAcademicAgent(task, {
        paidFetcher: dependencies?.paidFetcher,
        forcePaidFetchUrl: dependencies?.forcePaidFetchUrl,
      });
      break;

    default:
      throw new Error(
        `runAgent received unsupported task type "${task.type}". Module 2 only handles "search", "safety", and "academic".`
      );
  }

  // Submit result via StateWriter adapter if provided
  if (dependencies?.stateWriter) {
    await dependencies.stateWriter.submitTaskResult(task, result);
  }

  return result;
}
