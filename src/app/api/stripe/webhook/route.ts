import { NextResponse } from "next/server";
import Stripe from "stripe";
import { topUpUserCredit, getSupabaseClient } from "@/lib/credits";

export const dynamic = "force-dynamic";

// Processed events tracking set for idempotency check in memory/DB
const processedStripeSessions = new Set<string>();

function getStripeInstance() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is missing.");
  }
  return new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia" as any,
  });
}

export async function POST(request: Request) {
  const payload = await request.text();
  const sig = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // STRICT REQUIREMENT: Webhook Secret & Signature MUST be configured and present
  if (!webhookSecret || !sig) {
    return NextResponse.json(
      { error: "Security Error: Missing STRIPE_WEBHOOK_SECRET or stripe-signature header." },
      { status: 400 }
    );
  }

  const stripe = getStripeInstance();
  let event: Stripe.Event;

  try {
    // ALWAYS verify Stripe webhook cryptographic signature. NO unverified fallbacks.
    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Stripe Webhook Signature Verification Failed: ${(err as Error).message}` },
      { status: 400 }
    );
  }

  // Handle checkout.session.completed
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (!session.id) {
      return NextResponse.json({ error: "Invalid session object from Stripe." }, { status: 400 });
    }

    // Idempotency Check: Prevent duplicate credit processing on Stripe webhooks retry
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data: existing } = await supabase
        .from("stripe_processed_events")
        .select("event_id")
        .eq("event_id", session.id)
        .single();

      if (existing) {
        return NextResponse.json({ received: true, idempotent: true });
      }
    } else if (processedStripeSessions.has(session.id)) {
      return NextResponse.json({ received: true, idempotent: true });
    }

    const userId = session.metadata?.userId;
    if (!userId) {
      return NextResponse.json(
        { error: "Missing required 'userId' in session metadata." },
        { status: 400 }
      );
    }

    // Single Source of Truth: Use session.amount_total (cents charged by Stripe), converted to USD
    if (typeof session.amount_total !== "number" || session.amount_total <= 0) {
      return NextResponse.json(
        { error: "Invalid or zero session.amount_total from Stripe." },
        { status: 400 }
      );
    }

    const amountUsd = parseFloat((session.amount_total / 100).toFixed(2));

    // Record Event Idempotency
    if (supabase) {
      await supabase.from("stripe_processed_events").insert({ event_id: session.id });
    } else {
      processedStripeSessions.add(session.id);
    }

    const result = await topUpUserCredit(userId, amountUsd);
    console.log(`[Stripe Webhook Verified] Credited $${amountUsd} to user ${userId}. New balance: $${result.newBalance}`);

    return NextResponse.json({
      received: true,
      credited: amountUsd,
      userId,
      newBalance: result.newBalance,
    });
  }

  return NextResponse.json({ received: true });
}
