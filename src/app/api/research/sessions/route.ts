import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserSessions, deleteUserSessions } from "@/lib/supabase/db";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const sessions = await getUserSessions(userId);
    return NextResponse.json({ success: true, sessions });
  } catch (error: any) {
    console.error("[API Sessions] Error listing user sessions:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to list sessions" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const success = await deleteUserSessions(userId);
    if (!success) {
      return NextResponse.json({ success: false, error: "Failed to clear history" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API Sessions] Error clearing sessions:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to clear history" },
      { status: 500 }
    );
  }
}
