import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type CreateStudioJobBody = {
  title?: string;
  prompt?: string;
  style?: string;
  mood?: string;
  lyrics?: string;
  vocalMode?: string;
  artworkPrompt?: string;
  provider?: string;
};

function getBearerToken(header: string | null) {
  if (!header) return null;

  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;

  return header.slice(prefix.length).trim() || null;
}

function readRequiredEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return { supabaseUrl, anonKey };
}

function buildAuthClient(supabaseUrl: string, anonKey: string) {
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function buildUserClient(supabaseUrl: string, anonKey: string, accessToken: string) {
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { supabaseUrl, anonKey } = readRequiredEnv();
    const accessToken = getBearerToken(request.headers.get("authorization"));

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authClient = buildAuthClient(supabaseUrl, anonKey);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: userError?.message || "Invalid user session" },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => null)) as CreateStudioJobBody | null;
    const title = String(body?.title || "").trim();
    const prompt = String(body?.prompt || "").trim();
    const style = String(body?.style || "").trim();
    const mood = String(body?.mood || "").trim();
    const lyrics = String(body?.lyrics || "").trim();
    const vocalMode = String(body?.vocalMode || "").trim();
    const artworkPrompt = String(body?.artworkPrompt || "").trim();
    const provider = String(body?.provider || "runpod").trim() || "runpod";

    const userClient = buildUserClient(supabaseUrl, anonKey, accessToken);
    const { data, error } = await userClient
      .from("generation_jobs")
      .insert({
        user_id: user.id,
        title: title || null,
        prompt: prompt || null,
        style: style || null,
        mood: mood || null,
        lyrics: lyrics || null,
        vocal_mode: vocalMode || null,
        artwork_prompt: artworkPrompt || null,
        provider,
        status: "queued",
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Studio job create error:", error);
      return NextResponse.json(
        { error: error?.message || "Failed to create generation job" },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data.id });
  } catch (error: any) {
    console.error("Studio job create unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected studio job error" },
      { status: 500 }
    );
  }
}
