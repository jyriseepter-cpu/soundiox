import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      return NextResponse.json(
        {
          ok: false,
          step: "env",
          urlExists: Boolean(url),
          keyExists: Boolean(key),
          error: "Missing Supabase env values",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(url, key);

    const tracksRes = await supabase
      .from("tracks")
      .select("id,title,artist,is_published")
      .eq("is_published", true)
      .limit(5);

    const profilesRes = await supabase
      .from("profiles")
      .select("id,display_name,slug,role")
      .eq("role", "artist")
      .limit(5);

    return NextResponse.json({
      ok: true,
      env: {
        url,
        keyPrefix: key.slice(0, 20),
      },
      tracks: {
        error: tracksRes.error,
        count: tracksRes.data?.length ?? 0,
        data: tracksRes.data ?? [],
      },
      profiles: {
        error: profilesRes.error,
        count: profilesRes.data?.length ?? 0,
        data: profilesRes.data ?? [],
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        step: "catch",
        message: error?.message ?? "Unknown error",
        name: error?.name ?? null,
        stack: error?.stack ?? null,
      },
      { status: 500 }
    );
  }
}