import { NextResponse } from "next/server";
import { getSessionState } from "@/lib/supabase/db";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const sessionId = params.id;
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session ID" }, { status: 400 });
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
