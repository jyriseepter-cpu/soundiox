import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const runtime = "nodejs";

function readEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getBearerToken(header: string | null) {
  if (!header) return null;

  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;

  return header.slice(prefix.length).trim() || null;
}

function normalizePlan(input: unknown): "premium" | "artist" | null {
  const value = String(input || "")
    .trim()
    .toLowerCase();

  if (
    value === "premium" ||
    value === "premium_monthly" ||
    value === "premium_yearly"
  ) {
    return "premium";
  }

  if (
    value === "artist" ||
    value === "artist_monthly" ||
    value === "artist_yearly" ||
    value === "artist_pro" ||
    value === "artist_pro_monthly" ||
    value === "artist_pro_yearly"
  ) {
    return "artist";
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const stripeSecretKey = readEnv("STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY_LIVE");
    const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY (or STRIPE_SECRET_KEY_LIVE) in server env" },
        { status: 500 }
      );
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Missing Supabase auth environment variables" },
        { status: 500 }
      );
    }

    const accessToken = getBearerToken(req.headers.get("authorization"));

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("SUBSCRIBE_ROUTE_MARKER_v3");
    console.log(
      "STRIPE_KEY_PREFIX:",
      stripeSecretKey ? stripeSecretKey.slice(0, 7) : "MISSING_KEY"
    );

    const stripe = new Stripe(stripeSecretKey);

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = await req.json().catch(() => null);
    const plan = normalizePlan(body?.plan ?? body?.tier);

    if (!plan) {
      return NextResponse.json(
        { error: "Missing or invalid plan/tier" },
        { status: 400 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user?.id || !user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const premiumPriceId = readEnv(
      "STRIPE_PREMIUM_PRICE_ID",
      "PREMIUM_PRICE_ID"
    );

    const artistPriceId = readEnv(
      "STRIPE_ARTIST_PRICE_ID",
      "STRIPE_ARTIST_PRO_PRICE_ID",
      "ARTIST_PRO_PRICE_ID"
    );

    let priceId: string | null = null;

    if (plan === "premium") {
      priceId = premiumPriceId;
    }

    if (plan === "artist") {
      priceId = artistPriceId;
    }

    if (!priceId) {
      return NextResponse.json(
        {
          error: "Missing price ID env for selected plan",
          details: { plan },
        },
        { status: 500 }
      );
    }

    const appUrl =
      readEnv("NEXT_PUBLIC_APP_URL") ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      "http://localhost:3000";

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        userId: user.id,
        plan,
      },
      subscription_data: {
        trial_period_days: 30,
        metadata: {
          userId: user.id,
          plan,
        },
      },
      success_url: `${appUrl}/account?checkout=success&plan=${plan}`,
      cancel_url: `${appUrl}/account?checkout=cancel&plan=${plan}`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: "Stripe session created but session.url is empty" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: any) {
    console.error("SUBSCRIBE_ROUTE_ERROR_v2", err?.message || err);
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