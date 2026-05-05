import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const RUNPOD_GENERATE_URL = process.env.RUNPOD_GENERATE_URL;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_MALE_VOICE_ID = process.env.ELEVENLABS_MALE_VOICE_ID;
const ELEVENLABS_FEMALE_VOICE_ID = process.env.ELEVENLABS_FEMALE_VOICE_ID;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "tracks";

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

function getVoiceId(vocalMode: string | null) {
  if (vocalMode === "male") return ELEVENLABS_MALE_VOICE_ID || "";
  if (vocalMode === "female") return ELEVENLABS_FEMALE_VOICE_ID || "";
  return "";
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
    accessToken,
    userId: user.id,
    userClient: buildUserClient(supabaseUrl, anonKey, accessToken),
  };
}

async function updateJobStatus(
  userClient: ReturnType<typeof buildUserClient>,
  id: string,
  updates: Record<string, string | null>
) {
  const { data, error } = await userClient
    .from("generation_jobs")
    .update(updates)
    .eq("id", id)
    .select(
      "id,user_id,title,prompt,style,mood,lyrics,vocal_mode,artwork_prompt,provider,status,audio_url,vocal_url,artwork_url,error,created_at,updated_at"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to update generation job");
  }

  return data;
}

async function uploadGeneratedAsset(args: {
  supabaseUrl: string;
  serviceRoleKey: string;
  fileName: string;
  contentType: string;
  data: ArrayBuffer;
}) {
  const uploadUrl =
    `${args.supabaseUrl}/storage/v1/object/` +
    `${SUPABASE_BUCKET}/ai-generated/${args.fileName}`;

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      apikey: args.serviceRoleKey,
      Authorization: `Bearer ${args.serviceRoleKey}`,
      "Content-Type": args.contentType,
      "x-upsert": "true",
    },
    body: args.data,
  });

  const payload = await response.text().catch(() => "");

  if (!response.ok) {
    throw new Error(payload || `Storage upload failed with status ${response.status}`);
  }

  return (
    `${args.supabaseUrl}/storage/v1/object/public/` +
    `${SUPABASE_BUCKET}/ai-generated/${args.fileName}`
  );
}

async function createVocalLayer(args: {
  supabaseUrl: string;
  lyrics: string;
  vocalMode: string;
  jobId: string;
}) {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  const voiceId = getVoiceId(args.vocalMode);
  if (!voiceId) {
    throw new Error(`Voice ID is not configured for vocal mode: ${args.vocalMode}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60 * 1000);

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: args.lyrics,
          model_id: "eleven_multilingual_v2",
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(errorText || `ElevenLabs failed with status ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();

    return uploadGeneratedAsset({
      supabaseUrl: args.supabaseUrl,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      fileName: `${args.jobId}-vocal.mp3`,
      contentType: "audio/mpeg",
      data: audioBuffer,
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("ElevenLabs voice generation timed out after 60 seconds");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!RUNPOD_GENERATE_URL) {
      return NextResponse.json(
        { error: "RUNPOD_GENERATE_URL is not configured" },
        { status: 500 }
      );
    }

    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const { supabaseUrl } = readRequiredEnv();

    const { data: job, error: jobError } = await auth.userClient
      .from("generation_jobs")
      .select(
        "id,user_id,title,prompt,style,mood,lyrics,vocal_mode,artwork_prompt,provider,status,audio_url,vocal_url,artwork_url,error,created_at,updated_at"
      )
      .eq("id", id)
      .maybeSingle();

    if (jobError) {
      console.error("Studio job generate lookup error:", jobError);
      return NextResponse.json(
        { error: jobError.message || "Failed to load generation job" },
        { status: 500 }
      );
    }

    if (!job) {
      return NextResponse.json({ error: "Generation job not found" }, { status: 404 });
    }

    if (!job.prompt || !String(job.prompt).trim()) {
      return NextResponse.json(
        { error: "Generation job prompt is required before generation" },
        { status: 400 }
      );
    }

    await updateJobStatus(auth.userClient, id, {
      status: "running",
      error: null,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60 * 1000);

    try {
      const response = await fetch(RUNPOD_GENERATE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: String(job.prompt),
          style: job.style,
          mood: job.mood,
          lyrics: job.lyrics,
        }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      console.log("RUNPOD GENERATE RESPONSE:", payload);

      if (!response.ok) {
        throw new Error(
          payload?.error || `RunPod request failed with status ${response.status}`
        );
      }

      const audioUrl =
        typeof payload?.audio_url === "string" && payload.audio_url.trim()
          ? payload.audio_url.trim()
          : "";

      if (!audioUrl) {
        throw new Error("RunPod response did not include audio_url");
      }

      let vocalUrl: string | null = null;
      const vocalsEnabled =
        ["male", "female"].includes(String(job.vocal_mode || "")) &&
        Boolean(String(job.lyrics || "").trim());

      if (vocalsEnabled) {
        vocalUrl = await createVocalLayer({
          supabaseUrl,
          lyrics: String(job.lyrics || ""),
          vocalMode: String(job.vocal_mode || ""),
          jobId: id,
        });
      }

      const updatedJob = await updateJobStatus(auth.userClient, id, {
        status: "completed",
        audio_url: audioUrl,
        vocal_url: vocalUrl,
        error: null,
      });

      return NextResponse.json({
        job: updatedJob,
        audio_url: audioUrl,
        vocal_url: vocalUrl,
      });
    } catch (error: any) {
      const message =
        error?.name === "AbortError"
          ? "RunPod generation timed out after 60 seconds"
          : error?.message || "RunPod generation failed";

      console.error("Studio job generate error:", error);

      const failedJob = await updateJobStatus(auth.userClient, id, {
        status: "failed",
        error: message,
      });

      return NextResponse.json({ job: failedJob }, { status: 500 });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    console.error("Studio job generate unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected studio generate error" },
      { status: 500 }
    );
  }
}
