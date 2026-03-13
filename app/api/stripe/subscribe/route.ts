import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "subscribe-debug-v2",
    project: "soundiox",
    time: "2026-03-13-1745",
  });
}

export async function POST() {
  return NextResponse.json({
    ok: true,
    route: "subscribe-debug-v2-post",
    project: "soundiox",
    time: "2026-03-13-1745",
  });
}