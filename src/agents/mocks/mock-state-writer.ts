import type { StateWriter } from "../adapters/state-writer";
import type { Task, TaskResult } from "../types";

/**
 * Mock implementation of StateWriter for local testing without Module 1.
 * 
 * DEVELOPMENT ONLY: Stores submitted TaskResult objects in-memory.
 * Does NOT mutate database tables or session state directly.
 */
export class MockStateWriter implements StateWriter {
  public submittedResults: Array<{ task: Task; result: TaskResult }> = [];

  async submitTaskResult(task: Task, result: TaskResult): Promise<void> {
    this.submittedResults.push({ task, result });
    console.log(
      `[MockStateWriter] [DEV ONLY] Task ${task.id} (${task.type}) completed. Event-ready result submitted with ${result.sources.length} sources.`
    );
  }

  getLastResult(): TaskResult | undefined {
    return this.submittedResults[this.submittedResults.length - 1]?.result;
  }

  clear(): void {
    this.submittedResults = [];
  }
}
