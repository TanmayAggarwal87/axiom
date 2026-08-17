import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSessionState, getSessionUserId } from "@/lib/supabase/db";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const sessionId = params.id;
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session ID" }, { status: 400 });
    }

    // Verify session ownership to prevent cross-user session leaks
    const sessionOwner = await getSessionUserId(sessionId);
    if (sessionOwner && sessionOwner !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden: session belongs to another user" }, { status: 403 });
    }

    const state = await getSessionState(sessionId);
    if (!state) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, state });
  } catch (error: any) {
    console.error("[API Session] Error fetching session:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch session" },
      { status: 500 }
    );
  }
}

