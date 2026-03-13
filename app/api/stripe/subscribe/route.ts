import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

function requiredEnv(name: string) {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : null;
}

function normalizePlan(input: unknown): "premium" | "artist_pro" | null {
  const value = String(input || "").trim().toLowerCase();

  if (value === "premium" || value === "premium_monthly" || value === "premium_yearly") {
    return "premium";
  }

  if (
    value === "artist_pro" ||
    value === "artist_pro_monthly" ||
    value === "artist_pro_yearly"
  ) {
    return "artist_pro";
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const stripeSecretKey = requiredEnv("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY in server env" },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey);

    const body = await req.json().catch(() => null);

    const plan = normalizePlan(body?.plan ?? body?.tier);
    const userId = body?.userId as string | undefined;
    const email = body?.email as string | undefined;

    if (!plan) {
      return NextResponse.json(
        { error: "Missing or invalid plan/tier" },
        { status: 400 }
      );
    }

    const premiumPriceId = requiredEnv("STRIPE_PREMIUM_PRICE_ID");
    const artistProPriceId = requiredEnv("STRIPE_ARTIST_PRO_PRICE_ID");

    let priceId: string | null = null;
    if (plan === "premium") priceId = premiumPriceId;
    if (plan === "artist_pro") priceId = artistProPriceId;

    if (!priceId) {
      return NextResponse.json(
        { error: "Missing priceId env for plan", details: { plan } },
        { status: 500 }
      );
    }

    const appUrl = requiredEnv("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        userId: userId || "",
        plan,
      },
      success_url: `${appUrl}/account?checkout=success&plan=${plan}`,
      cancel_url: `${appUrl}/account?checkout=cancel&plan=${plan}`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe session created but session.url is empty" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe Checkout Error:", err?.message || err, err);

    return NextResponse.json(
      {
        error: "Stripe checkout failed",
        message: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}