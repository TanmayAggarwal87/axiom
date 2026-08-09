import { NextResponse } from "next/server";
import { ensureUser, getUserCredits } from "@/lib/supabase/db";

/**
 * Simulates a Stripe test-mode top-up by directly crediting the user's wallet.
 * In production, this would be a Stripe webhook handler (Module 3 owns Stripe integration).
 * Module 4 provides the UI flow that triggers this endpoint.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId = "default-user", amount } = body;

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

    // Get current balance, then add the top-up amount
    const currentCredits = await getUserCredits(userId);
    const newBalance = currentCredits + amount;

    // Use ensureUser to upsert with the new balance
    await ensureUser(userId, "demo@axiom.org", newBalance);

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
