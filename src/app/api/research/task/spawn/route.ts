import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSessionState, insertEvent } from "@/lib/supabase/db";
import { executeSession } from "@/lib/orchestrator/executor";
import type { SessionEvent, Task } from "@/lib/orchestrator/types";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const { sessionId, task } = body;

    if (!sessionId || !task) {
      return NextResponse.json({ error: "Missing required fields: sessionId, task" }, { status: 400 });
    }

    const state = await getSessionState(sessionId);
    if (!state) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Enforce limits: maxDynamicTasks <= 3 (default or session-defined)
    const currentDynamicTasks = state.tasks.filter((t) => t.createdBy === "factchecker").length;
    const maxDynamicTasks = state.budget?.maxDynamicTasks ?? 3;

    if (currentDynamicTasks >= maxDynamicTasks) {
      return NextResponse.json(
        { success: false, error: `Dynamic tasks limit (${maxDynamicTasks}) exceeded.` },
        { status: 400 }
      );
    }

    // Set properties correctly
    const newTask: Task = {
      ...task,
      sessionId,
      status: "ready", // Spawned tasks can run immediately
      createdBy: "factchecker",
      result: null,
    };

    // Write task_spawned event
    const event: SessionEvent = {
      id: `evt-spawn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      type: "task_spawned",
      payload: newTask,
      createdAt: new Date().toISOString(),
    };

    await insertEvent(sessionId, event);

    // Reactively trigger execution loop
    executeSession(sessionId).catch((err) => {
      console.error(`[API Spawn] Error resuming executor for session ${sessionId}:`, err);
    });

    return NextResponse.json({ success: true, task: newTask });
  } catch (error: any) {
    console.error("[API Spawn] Error spawning dynamic task:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to spawn dynamic task" },
      { status: 500 }
    );
  }
}
