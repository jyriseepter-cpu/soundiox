import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

function getAppUrl() {
  return getRequiredEnv("NEXT_PUBLIC_APP_URL") || "https://soundiox.io";
}

export async function POST(req: NextRequest) {
  const stripeSecretKey = getRequiredEnv("STRIPE_SECRET_KEY");

  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: "Missing STRIPE_SECRET_KEY" },
      { status: 500 }
    );
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    const body = await req.json().catch(() => null);

    const amount = Number(body?.amount ?? 0);
    const artistName = String(body?.artistName ?? "Artist").trim();
    const artistId = String(body?.artistId ?? "").trim();
    const donorEmail = String(body?.email ?? "").trim();

    if (!amount || amount < 1) {
      return NextResponse.json(
        { error: "Invalid donation amount" },
        { status: 400 }
      );
    }

    const appUrl = getAppUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: donorEmail || undefined,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Donate to ${artistName}`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "donation",
        artistId,
        artistName,
      },
      success_url: `${appUrl}/artists/${artistId || ""}?donate=success`,
      cancel_url: `${appUrl}/artists/${artistId || ""}?donate=cancel`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe session created but session.url is empty" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe Donate Error:", err?.message || err, err);

    return NextResponse.json(
      {
        error: "Stripe donate failed",
        message: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}