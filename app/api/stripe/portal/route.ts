import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://soundiox.io";
}

export async function POST(req: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    return NextResponse.json(
      { error: "Missing STRIPE_SECRET_KEY in environment variables" },
      { status: 500 }
    );
  }

  const stripe = new Stripe(stripeSecretKey);

  try {
    const body = await req.json().catch(() => ({}));
    const email = body?.email ? String(body.email).trim() : "";

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const appUrl = getAppUrl();

    const customers = await stripe.customers.list({
      email,
      limit: 1,
    });

    const customer =
      customers.data[0] || (await stripe.customers.create({ email }));

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${appUrl}/account`,
    });

    if (!portalSession.url) {
      return NextResponse.json(
        { error: "Billing portal URL missing" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: portalSession.url });
  } catch (err: any) {
    console.error("Portal error:", err);
    return NextResponse.json(
      { error: err?.message || "Portal failed" },
      { status: 500 }
    );
  }
}