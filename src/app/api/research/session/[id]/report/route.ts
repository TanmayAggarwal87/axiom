import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSessionReport, getSessionUserId } from "@/lib/supabase/db";

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

    // Verify session ownership
    const sessionOwner = await getSessionUserId(sessionId);
    if (sessionOwner && sessionOwner !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden: session belongs to another user" }, { status: 403 });
    }

    const report = await getSessionReport(sessionId);
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    console.error("[API Report] Error fetching session report:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch report" },
      { status: 500 }
    );
  }
}
