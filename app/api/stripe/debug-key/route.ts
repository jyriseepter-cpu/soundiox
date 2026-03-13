import { NextResponse } from "next/server";

export const runtime = "nodejs";

function mask(value: string | undefined) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 7)}...${value.slice(-6)}`;
}

export async function GET() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
  const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID || "";
  const artistProPriceId = process.env.STRIPE_ARTIST_PRO_PRICE_ID || "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const vercelUrl = process.env.VERCEL_URL || "";
  const vercelEnv = process.env.VERCEL_ENV || "";
  const vercelProject = process.env.VERCEL_PROJECT_PRODUCTION_URL || "";

  return NextResponse.json({
    ok: true,
    stripeSecretKeyMasked: mask(stripeSecretKey),
    stripeSecretKeyStartsWith: stripeSecretKey.startsWith("sk_live_")
      ? "sk_live"
      : stripeSecretKey.startsWith("sk_test_")
      ? "sk_test"
      : "unknown",
    premiumPriceIdMasked: mask(premiumPriceId),
    artistProPriceIdMasked: mask(artistProPriceId),
    appUrl,
    vercelUrl,
    vercelEnv,
    vercelProject,
  });
}