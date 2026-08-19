import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { insertEvent } from "@/lib/supabase/db";
import { executeSession } from "@/lib/orchestrator/executor";
import type { SessionEvent } from "@/lib/orchestrator/types";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const { taskId, sessionId, result } = body;

    if (!taskId || !sessionId || !result) {
      return NextResponse.json({ error: "Missing required fields: taskId, sessionId, result" }, { status: 400 });
    }

    // Write task completion event
    const event: SessionEvent = {
      id: `evt-task-done-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      type: "task_completed",
      payload: {
        taskId,
        result,
      },
      createdAt: new Date().toISOString(),
    };

    await insertEvent(sessionId, event);

    // Reactively trigger execution loop in background to proceed with ready dependent tasks
    // (We don't block the submit request wait unless needed)
    executeSession(sessionId).catch((err) => {
      console.error(`[API Submit] Error resuming executor for session ${sessionId}:`, err);
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API Submit] Error submitting task result:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to submit task result" },
      { status: 500 }
    );
  }
}
