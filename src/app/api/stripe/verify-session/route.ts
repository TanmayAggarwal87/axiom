import { NextResponse } from "next/server";
import Stripe from "stripe";
import { topUpUserCredit, getUserCreditBalance } from "@/lib/credits";

export const dynamic = "force-dynamic";

// In-memory idempotency for dev (Supabase handles it in prod via stripe_processed_events)
const processedSessions = new Set<string>();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.includes("sk_test_51...") || key.includes("your_stripe")) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" as any });
}

export async function POST(request: Request) {
  try {
    const { sessionId, userId } = await request.json();

    if (!sessionId || !userId) {
      return NextResponse.json(
        { error: "sessionId and userId are required." },
        { status: 400 }
      );
    }

    // Idempotency: already credited this session
    if (processedSessions.has(sessionId)) {
      const balance = await getUserCreditBalance(userId);
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        credits: balance,
      });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return NextResponse.json({
        success: false,
        status: session.payment_status,
        message: "Payment not yet confirmed by Stripe.",
      });
    }

    // Verify user matches
    if (session.metadata?.userId && session.metadata.userId !== userId) {
      return NextResponse.json({ error: "User mismatch." }, { status: 403 });
    }

    const amountUsd = parseFloat(((session.amount_total ?? 0) / 100).toFixed(2));

    // Mark as processed before writing credits (idempotency)
    processedSessions.add(sessionId);

    const result = await topUpUserCredit(userId, amountUsd);

    console.log(
      `[Stripe Verify] Credited $${amountUsd} to ${userId}. New balance: $${result.newBalance}`
    );

    return NextResponse.json({
      success: true,
      credited: amountUsd,
      credits: result.newBalance,
    });
  } catch (err: any) {
    if (err.message === "STRIPE_NOT_CONFIGURED") {
      return NextResponse.json({
        success: false,
        stripeNotConfigured: true,
        message: "Stripe is not configured. Use Instant Top-Up instead.",
      });
    }
    console.error("[Stripe Verify] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
