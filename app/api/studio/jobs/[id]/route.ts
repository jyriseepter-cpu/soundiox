import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type PatchStudioJobBody = {
  title?: string;
  prompt?: string;
  style?: string;
  mood?: string;
  lyrics?: string;
  vocalMode?: string;
  artworkPrompt?: string;
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

function normalizeNullableString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

async function authorize(request: NextRequest) {
  const { supabaseUrl, anonKey } = readRequiredEnv();
  const accessToken = getBearerToken(request.headers.get("authorization"));

  if (!accessToken) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const authClient = buildAuthClient(supabaseUrl, anonKey);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(accessToken);

  if (userError || !user) {
    return {
      error: NextResponse.json(
        { error: userError?.message || "Invalid user session" },
        { status: 401 }
      ),
    };
  }

  return {
    supabaseUrl,
    anonKey,
    accessToken,
    userId: user.id,
    userClient: buildUserClient(supabaseUrl, anonKey, accessToken),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const { data, error } = await auth.userClient
      .from("generation_jobs")
      .select(
        "id,user_id,title,prompt,style,mood,lyrics,vocal_mode,artwork_prompt,provider,status,audio_url,artwork_url,error,created_at,updated_at"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Studio job fetch error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to load generation job" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: "Generation job not found" }, { status: 404 });
    }

    return NextResponse.json({ job: data });
  } catch (error: any) {
    console.error("Studio job fetch unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected studio job error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    const { id } = await params;

    const { data: currentJob, error: currentError } = await auth.userClient
      .from("generation_jobs")
      .select("id,status")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      console.error("Studio job current lookup error:", currentError);
      return NextResponse.json(
        { error: currentError.message || "Failed to load generation job" },
        { status: 500 }
      );
    }

    if (!currentJob) {
      return NextResponse.json({ error: "Generation job not found" }, { status: 404 });
    }

    if (!["draft", "queued", "failed"].includes(String(currentJob.status || ""))) {
      return NextResponse.json(
        { error: "Only draft generation jobs can be edited" },
        { status: 409 }
      );
    }

    const body = (await request.json().catch(() => null)) as PatchStudioJobBody | null;
    const updates = {
      title: normalizeNullableString(body?.title),
      prompt: normalizeNullableString(body?.prompt),
      style: normalizeNullableString(body?.style),
      mood: normalizeNullableString(body?.mood),
      lyrics: normalizeNullableString(body?.lyrics),
      vocal_mode: normalizeNullableString(body?.vocalMode),
      artwork_prompt: normalizeNullableString(body?.artworkPrompt),
    };

    const { data, error } = await auth.userClient
      .from("generation_jobs")
      .update(updates)
      .eq("id", id)
      .select(
        "id,user_id,title,prompt,style,mood,lyrics,vocal_mode,artwork_prompt,provider,status,audio_url,artwork_url,error,created_at,updated_at"
      )
      .single();

    if (error) {
      console.error("Studio job update error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to update generation job" },
        { status: 500 }
      );
    }

    return NextResponse.json({ job: data });
  } catch (error: any) {
    console.error("Studio job update unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected studio job error" },
      { status: 500 }
    );
  }
}
