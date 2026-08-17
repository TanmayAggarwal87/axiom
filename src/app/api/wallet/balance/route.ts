import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserCredits, ensureUser } from "@/lib/supabase/db";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Ensure wallet exists — use userId-based fallback email (no slow currentUser() call)
    await ensureUser(userId, `${userId}@user.axiom`, 10.0);

    const credits = await getUserCredits(userId);

    return NextResponse.json({
      success: true,
      userId,
      credits,
    });
  } catch (error: any) {
    console.error("[Wallet Balance] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch balance" },
      { status: 500 }
    );
  }
}
