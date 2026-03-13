import { NextResponse } from "next/server";

export const runtime = "nodejs";

function mask(value?: string | null) {
  if (!value) return "MISSING";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    return NextResponse.json(
      {
        debug: true,
        tier: body?.tier ?? null,
        env: {
          STRIPE_SECRET_KEY: mask(process.env.STRIPE_SECRET_KEY),
          STRIPE_PREMIUM_PRICE_ID: mask(process.env.STRIPE_PREMIUM_PRICE_ID),
          STRIPE_ARTIST_PRO_PRICE_ID: mask(process.env.STRIPE_ARTIST_PRO_PRICE_ID),
          NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "MISSING",
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Debug failed" },
      { status: 500 }
    );
  }
}