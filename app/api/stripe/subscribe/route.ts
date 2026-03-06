import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY in environment variables");
}

const stripe = new Stripe(stripeSecretKey);

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const tier = String(body?.tier || "").toLowerCase();

    const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID;
    const proPriceId = process.env.STRIPE_ARTIST_PRO_PRICE_ID;

    if (!premiumPriceId || !proPriceId) {
      return NextResponse.json(
        { error: "Missing STRIPE_PREMIUM_PRICE_ID or STRIPE_ARTIST_PRO_PRICE_ID" },
        { status: 500 }
      );
    }

    const priceId =
      tier === "premium" ? premiumPriceId : tier === "artist_pro" ? proPriceId : null;

    if (!priceId) {
      return NextResponse.json(
        { error: "Invalid tier. Use 'premium' or 'artist_pro'." },
        { status: 400 }
      );
    }

    const appUrl = getAppUrl();
    const customerEmail = body?.email ? String(body.email) : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/account?checkout=success&tier=${tier}`,
      cancel_url: `${appUrl}/account?checkout=cancel&tier=${tier}`,
      customer_email: customerEmail,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Subscribe checkout error:", err);
    return NextResponse.json(
      { error: err?.message || "Subscribe failed" },
      { status: 500 }
    );
  }
}