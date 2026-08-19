import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUser, getUserCredits, supabase, useRealSupabase } from "@/lib/supabase/db";

/**
 * Direct top-up handler for testing / credit top-up.
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { amount } = body;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid top-up amount" },
        { status: 400 }
      );
    }

    if (amount > 100) {
      return NextResponse.json(
        { success: false, error: "Maximum top-up amount is $100.00" },
        { status: 400 }
      );
    }

    // Use userId-based fallback email (no slow currentUser() call)
    const email = `${userId}@user.axiom`;

    // Get current balance
    const currentCredits = await getUserCredits(userId);
    const newBalance = Number((currentCredits + amount).toFixed(4));

    if (useRealSupabase && supabase) {
      const { error } = await supabase.from("users").upsert({
        id: userId,
        email,
        credits: newBalance,
      });
      if (error) throw error;
    } else {
      await ensureUser(userId, email, newBalance);
    }

    return NextResponse.json({
      success: true,
      userId,
      previousBalance: currentCredits,
      topUpAmount: amount,
      newBalance,
    });
  } catch (error: any) {
    console.error("[Wallet TopUp] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to top up wallet" },
      { status: 500 }
    );
  }
}
