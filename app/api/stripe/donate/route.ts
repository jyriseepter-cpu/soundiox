// app/api/stripe/donate/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const stripe = new Stripe(stripeSecretKey);

// Hoia annetuse summad lihtsad ja turvalised (EUR cents)
const ALLOWED_AMOUNTS = [300, 500, 1000, 2000, 5000]; // 3€, 5€, 10€, 20€, 50€

function sanitizeSlug(input: unknown) {
  const s = String(input || "")
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9-]{1,64}$/.test(s)) return null;
  return s;
}

function sanitizeUuid(input: unknown) {
  const s = String(input || "").trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      s
    )
  ) {
    return null;
  }
  return s;
}

function centsToEur(cents: number) {
  return Number((cents / 100).toFixed(2));
}

function buildSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(req: Request) {
  try {
    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const artistSlug = sanitizeSlug(body?.artistSlug);
    const fanUserId = sanitizeUuid(body?.fanUserId);
    const amount = Number(body?.amount);

    if (!artistSlug) {
      return NextResponse.json(
        { error: "Invalid artistSlug" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(amount) || !ALLOWED_AMOUNTS.includes(amount)) {
      return NextResponse.json(
        {
          error:
            "Invalid amount. Allowed: 300, 500, 1000, 2000, 5000 (EUR cents)",
        },
        { status: 400 }
      );
    }

    const supabase = buildSupabaseAdmin();

    // Otsime artisti profiles tabelist slug alusel
    const { data: artist, error: artistError } = await supabase
      .from("profiles")
      .select("id, display_name, slug")
      .eq("slug", artistSlug)
      .single();

    if (artistError || !artist) {
      return NextResponse.json(
        { error: "Artist not found" },
        { status: 404 }
      );
    }

    const amountEur = centsToEur(amount);
    const artistAmount = Number((amountEur * 0.7).toFixed(2));
    const platformAmount = Number((amountEur * 0.3).toFixed(2));
    const artistName =
      artist.display_name?.trim() || artist.slug || "SoundioX Artist";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Donate to ${artistName}`,
              description: "Support an AI artist on SoundioX",
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/artists/${artistSlug}?donate=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/artists/${artistSlug}?donate=cancel`,
      metadata: {
        type: "donation",
        artist_slug: artistSlug,
        artist_id: artist.id,
        fan_user_id: fanUserId || "",
        amount_eur_cents: String(amount),
        amount_eur: amountEur.toFixed(2),
        artist_amount_eur: artistAmount.toFixed(2),
        platform_amount_eur: platformAmount.toFixed(2),
      },
    });

    if (!session.id || !session.url) {
      return NextResponse.json(
        { error: "Failed to create Stripe checkout session" },
        { status: 500 }
      );
    }

    const { error: insertError } = await supabase.from("artist_donations").insert({
      artist_id: artist.id,
      fan_user_id: fanUserId,
      amount: amountEur,
      artist_amount: artistAmount,
      platform_amount: platformAmount,
      currency: "eur",
      stripe_checkout_session_id: session.id,
      status: "pending",
    });

    if (insertError) {
      console.error("artist_donations insert error:", insertError);

      return NextResponse.json(
        { error: "Stripe session created, but donation row insert failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("Donate checkout error:", err);

    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}