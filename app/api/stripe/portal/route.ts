import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY in environment variables");
}

const stripe = new Stripe(stripeSecretKey, {

});

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = body?.email ? String(body.email) : null;

    if (!email) {
      return NextResponse.json(
        { error: "Missing email" },
        { status: 400 }
      );
    }

    const appUrl = getAppUrl();

    // 1) leia customer (või loo)
    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer =
      customers.data[0] || (await stripe.customers.create({ email }));

    // 2) portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${appUrl}/account`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err: any) {
    console.error("Portal error:", err);
    return NextResponse.json(
      { error: err?.message || "Portal failed" },
      { status: 500 }
    );
  }
}