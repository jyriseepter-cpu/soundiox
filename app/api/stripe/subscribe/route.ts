import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const runtime = "nodejs";

function requiredEnv(name: string) {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : null;
}

function getBearerToken(header: string | null) {
  if (!header) return null;

  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;

  return header.slice(prefix.length).trim() || null;
}

function normalizePlan(input: unknown): "premium" | "artist" | null {
  const value = String(input || "").trim().toLowerCase();

  if (value === "premium" || value === "premium_monthly" || value === "premium_yearly") {
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
    const stripeSecretKey = requiredEnv("STRIPE_SECRET_KEY_LIVE");
    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseAnonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY_LIVE in server env" },
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

    console.log("SUBSCRIBE_ROUTE_MARKER_v2");

    console.log(
      "STRIPE_SECRET_KEY_LIVE_PREFIX:",
      process.env.STRIPE_SECRET_KEY_LIVE
        ? process.env.STRIPE_SECRET_KEY_LIVE.slice(0, 7)
        : "MISSING_KEY"
    );

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_LIVE as string);
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

    const premiumPriceId = requiredEnv("STRIPE_PREMIUM_PRICE_ID");
    const artistProPriceId = requiredEnv("STRIPE_ARTIST_PRO_PRICE_ID");

    let priceId: string | null = null;
    if (plan === "premium") priceId = premiumPriceId;
    if (plan === "artist") priceId = artistProPriceId;

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
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        userId: user.id,
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
    console.error("SUBSCRIBE_ROUTE_ERROR_v1", err?.message || err);
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
