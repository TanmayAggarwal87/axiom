import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/supabase/db";
import { initializeSessionBudget } from "@/lib/orchestrator/budget";
import { planResearch } from "@/lib/orchestrator/planner";
import { insertEvent } from "@/lib/supabase/db";
import { executeSession } from "@/lib/orchestrator/executor";
import type { SessionEvent } from "@/lib/orchestrator/types";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Please sign in to start research." },
        { status: 401 }
      );
    }

    // Use userId-based fallback email (no slow currentUser() network call)
    const email = `${userId}@user.axiom`;

    const body = await req.json();
    const { query, budgetUsdc } = body;

    if (!query || query.trim() === "") {
      return NextResponse.json({ error: "Missing required query field" }, { status: 400 });
    }

    // Ensure the authenticated user exists in DB
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

    // 4. Trigger executor in background (non-blocking async execution)
    // Allows immediate response (<1s) while LiveSessionView streams realtime progress
    executeSession(sessionId).catch((err) => {
      console.error(`[Executor Background Error] Session ${sessionId}:`, err);
    });

    return NextResponse.json({
      success: true,
      sessionId,
      budget,
      tasksCount: tasks.length,
    });
  } catch (error: any) {
    console.error("[API Start] Error starting research:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to start research" },
      { status: 500 }
    );
  }
}
