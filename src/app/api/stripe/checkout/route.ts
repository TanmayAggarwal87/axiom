import { NextResponse } from "next/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

function getStripeInstance() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || secretKey.includes("sk_test_51...")) {
    throw new Error("Configuration Error: STRIPE_SECRET_KEY environment variable is missing or unconfigured.");
  }
  return new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia" as any,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, amountUsd, successUrl, cancelUrl } = body;

    // Strict validation: userId and amountUsd MUST be explicitly provided
    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      return NextResponse.json(
        { error: "Bad Request: 'userId' is required and must be a valid non-empty string." },
        { status: 400 }
      );
    }

    if (!amountUsd || typeof amountUsd !== "number" || amountUsd <= 0) {
      return NextResponse.json(
        { error: "Bad Request: 'amountUsd' is required and must be a positive number." },
        { status: 400 }
      );
    }

    const stripe = getStripeInstance();
    const origin = request.headers.get("origin") || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Axiom Research Credits",
              description: `Top-up of $${amountUsd} user credit wallet for autonomous research sessions`,
            },
            unit_amount: Math.round(amountUsd * 100), // convert USD to cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl || `${origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${origin}/dashboard?checkout=cancelled`,
      metadata: {
        userId,
        amountUsd: amountUsd.toString(),
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to create Stripe Checkout session: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
