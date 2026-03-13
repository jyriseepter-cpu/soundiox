import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";

function mask(value: string) {
  if (!value) return "MISSING";
  if (value.length < 16) return value;
  return `${value.slice(0, 12)}...${value.slice(-6)}`;
}

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function normalizeTier(input: unknown): "premium" | "artist_pro" | null {
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

export async function POST(req: Request) {
  const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID || "";
  const proPriceId = process.env.STRIPE_ARTIST_PRO_PRICE_ID || "";
  const appUrl = getAppUrl();

  try {
    if (!stripeSecretKey) {
      return NextResponse.json(
        {
          error: `Missing STRIPE_SECRET_KEY | key=${mask(stripeSecretKey)} | premium=${mask(
            premiumPriceId
          )} | pro=${mask(proPriceId)} | app=${appUrl}`,
        },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey);

    const body = await req.json().catch(() => ({}));
    const normalizedTier = normalizeTier(body?.tier ?? body?.plan);

    if (!premiumPriceId || !proPriceId) {
      return NextResponse.json(
        {
          error: `Missing price env | key=${mask(stripeSecretKey)} | premium=${mask(
            premiumPriceId
          )} | pro=${mask(proPriceId)} | app=${appUrl}`,
        },
        { status: 500 }
      );
    }

    if (!normalizedTier) {
      return NextResponse.json(
        {
          error: `Invalid tier/plan | got=${String(
            body?.tier ?? body?.plan ?? ""
          )} | key=${mask(stripeSecretKey)}`,
        },
        { status: 400 }
      );
    }

    const priceId = normalizedTier === "premium" ? premiumPriceId : proPriceId;
    const customerEmail = body?.email ? String(body.email).trim() : undefined;
    const userId = body?.userId ? String(body.userId).trim() : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/account?checkout=success&tier=${normalizedTier}`,
      cancel_url: `${appUrl}/account?checkout=cancel&tier=${normalizedTier}`,
      customer_email: customerEmail || undefined,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      metadata: {
        tier: normalizedTier,
        userId: userId || "",
      },
    });

    if (!session.url) {
      return NextResponse.json(
        {
          error: `Stripe session created but session.url is empty | key=${mask(
            stripeSecretKey
          )} | price=${mask(priceId)} | app=${appUrl}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: `${err?.message || "Subscribe failed"} | key=${mask(
          stripeSecretKey
        )} | premium=${mask(premiumPriceId)} | pro=${mask(proPriceId)} | app=${appUrl}`,
      },
      { status: 500 }
    );
  }
}