import { NextResponse } from "next/server";

export const runtime = "nodejs";

function mask(value: string | undefined) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 7)}...${value.slice(-6)}`;
}

export async function GET() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";

  return NextResponse.json({
    stripeSecretKeyStartsWith: stripeSecretKey.startsWith("sk_live_")
      ? "sk_live"
      : stripeSecretKey.startsWith("sk_test_")
      ? "sk_test"
      : "unknown",
    masked: mask(stripeSecretKey),
    vercelEnv: process.env.VERCEL_ENV,
    vercelUrl: process.env.VERCEL_URL
  });
}