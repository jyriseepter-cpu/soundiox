import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs"; // Stripe vajab Node runtime'i (mitte Edge)

function requiredEnv(name: string) {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : null;
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

    const plan = body?.plan as "premium" | "artist_pro" | undefined;
    const userId = body?.userId as string | undefined;
    const email = body?.email as string | undefined;

    if (!plan || !userId || !email) {
      return NextResponse.json(
        { error: "Missing required fields", details: { plan, userId, email } },
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

    const appUrl =
      requiredEnv("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId, plan },
      success_url: `${appUrl}/billing/success`,
      cancel_url: `${appUrl}/billing/cancel`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe session created but session.url is empty" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    // Stripe error message on kõige olulisem debugiks
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