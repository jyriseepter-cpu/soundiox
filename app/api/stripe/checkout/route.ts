import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  return NextResponse.json({
    ok: true,
    route: "checkout-debug-hit",
    got: body,
    time: "2026-03-13-checkout-route",
  });
}