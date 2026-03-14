import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const runtime = "nodejs";

function getBearerToken(header: string | null) {
  if (!header) return null;

  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;

  return header.slice(prefix.length).trim() || null;
}

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://soundiox.io";
}

export async function POST(req: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !stripeSecretKey ||
    !supabaseUrl ||
    !supabaseAnonKey ||
    !supabaseServiceRoleKey
  ) {
    return NextResponse.json(
      { error: "Missing required environment variables" },
      { status: 500 }
    );
  }

  const accessToken = getBearerToken(req.headers.get("authorization"));

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = new Stripe(stripeSecretKey);
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Portal profile lookup error:", profileError);
      return NextResponse.json(
        { error: "Failed to load billing profile" },
        { status: 500 }
      );
    }

    const stripeCustomerId =
      typeof profile?.stripe_customer_id === "string"
        ? profile.stripe_customer_id.trim()
        : "";

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account found for this user" },
        { status: 404 }
      );
    }

    const appUrl = getAppUrl();

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
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
