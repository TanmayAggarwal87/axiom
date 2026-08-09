import { NextResponse } from "next/server";
import { getUserCredits } from "@/lib/supabase/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "default-user";

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
