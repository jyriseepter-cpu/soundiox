// app/api/stripe/donate/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// Hoia annetuse summad lihtsad ja turvalised (EUR cents)
const ALLOWED_AMOUNTS = [300, 500, 1000, 2000, 5000]; // 3€, 5€, 10€, 20€, 50€

function sanitizeSlug(input: unknown) {
  const s = String(input || "").trim().toLowerCase();
  // lihtne slug: a-z 0-9 ja -
  if (!/^[a-z0-9-]{1,64}$/.test(s)) return null;
  return s;
}

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const artistSlug = sanitizeSlug(body?.artistSlug);
    const amount = Number(body?.amount);

    if (!artistSlug) {
      return NextResponse.json({ error: "Invalid artistSlug" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || !ALLOWED_AMOUNTS.includes(amount)) {
      return NextResponse.json(
        { error: "Invalid amount. Allowed: 300, 500, 1000, 2000, 5000 (EUR cents)" },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      // One-time donation
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Donate to ${artistSlug}`,
              description: "Support an AI artist on SoundioX",
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      success_url: `${APP_URL}/artists/${artistSlug}?donate=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/artists/${artistSlug}?donate=cancel`,
      metadata: {
        type: "donation",
        artist_slug: artistSlug,
        amount_eur_cents: String(amount),
      },
      // Hiljem webhookis saad siduda kas user_id / artist_id jne
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("Donate checkout error:", err);
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}