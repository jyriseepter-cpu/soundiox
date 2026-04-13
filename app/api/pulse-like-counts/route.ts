import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type TrackLikeMonthlyRow = {
  track_id: string | null;
  likes: number | null;
};

function monthStartISO() {
  const now = new Date();
  now.setDate(1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing Supabase server environment variables" },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    const trackIds = Array.from(
      new Set(
        ((body?.trackIds ?? []) as unknown[])
          .map((value) => String(value || "").trim())
          .filter((value) => value.length > 0)
      )
    ).slice(0, 200);

    if (!trackIds.length) {
      return NextResponse.json({ counts: {}, month: monthStartISO() });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const month = monthStartISO();
    const { data, error } = await admin
      .from("track_likes_monthly")
      .select("track_id,likes")
      .eq("month", month)
      .in("track_id", trackIds);

    if (error) {
      console.error("pulse-like-counts query error:", error);
      return NextResponse.json(
        { error: error.message || "Could not load like counts" },
        { status: 500 }
      );
    }

    const counts: Record<string, number> = {};

    for (const row of ((data ?? []) as TrackLikeMonthlyRow[])) {
      const trackId = String(row.track_id || "").trim();
      if (!trackId) continue;
      counts[trackId] = Number(row.likes ?? 0);
    }

    return NextResponse.json({ counts, month });
  } catch (error: any) {
    console.error("pulse-like-counts unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
