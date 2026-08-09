import { NextResponse } from "next/server";
import { ensureUser } from "@/lib/supabase/db";
import { initializeSessionBudget } from "@/lib/orchestrator/budget";
import { planResearch } from "@/lib/orchestrator/planner";
import { insertEvent } from "@/lib/supabase/db";
import { executeSession } from "@/lib/orchestrator/executor";
import type { SessionEvent, Task } from "@/lib/orchestrator/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query, userId = "default-user", email = "demo@axiom.org", budgetUsdc } = body;

    if (!query || query.trim() === "") {
      return NextResponse.json({ error: "Missing required query field" }, { status: 400 });
    }

    // Ensure the test user exists (for local testing/dev simplicity)
    await ensureUser(userId, email, 10.0);

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 1. Initialize budget & session
    const budget = await initializeSessionBudget(sessionId, userId, budgetUsdc);

    // 2. Plan research tasks via Gemini
    const tasks = await planResearch(sessionId, query);

    // 3. Write tasks to session state using task_spawned events
    for (const task of tasks) {
      const spawnEvent: SessionEvent = {
        id: `evt-spawn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sessionId,
        type: "task_spawned",
        payload: task,
        createdAt: new Date().toISOString(),
      };
      await insertEvent(sessionId, spawnEvent);
    }

    // 4. Run executor to resolve plans (runs in parallel, dependency-aware)
    const finalState = await executeSession(sessionId);

    return NextResponse.json({
      success: true,
      sessionId,
      budget,
      tasksCount: tasks.length,
      finalState,
    });
  } catch (error: any) {
    console.error("[API Start] Error starting research:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to start research" },
      { status: 500 }
    );
  }
}
