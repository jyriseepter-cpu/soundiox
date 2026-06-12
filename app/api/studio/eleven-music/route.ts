import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type ElevenMusicBody = {
  title?: string;
  projectName?: string;
  genre?: string;
  prompt?: string;
  vocalMode?: string;
  lyrics?: string;
  durationSeconds?: number | null;
  trackGroupId?: string | null;
  parentVersionId?: string | null;
  artworkUrl?: string | null;
  artworkConcept?: unknown;
};

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "tracks";
const MAX_MUSIC_LENGTH_MS = 30000;

function getBearerToken(header: string | null) {
  if (!header) return null;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;
  return header.slice(prefix.length).trim() || null;
}

function readRequiredEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return { supabaseUrl, anonKey, serviceRoleKey };
}

function buildAuthClient(supabaseUrl: string, anonKey: string) {
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function buildServiceClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function columnExists(
  serviceClient: ReturnType<typeof buildServiceClient>,
  table: string,
  column: string
) {
  const { error } = await serviceClient.from(table).select(column).limit(1);
  return !error;
}

function sanitizePathPart(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "studio-song"
  );
}

function buildElevenMusicPrompt(args: {
  title: string;
  genre: string;
  prompt: string;
  vocalMode: string;
  lyrics: string;
}) {
  return [
    `Title: ${args.title}`,
    args.genre ? `Genre: ${args.genre}` : "",
    `Style and direction: ${args.prompt}`,
    args.vocalMode ? `Vocal mode: ${args.vocalMode}` : "Vocal mode: singing vocals",
    "Create a complete short song with clear singing vocals. Do not make it instrumental.",
    `Lyrics:\n${args.lyrics}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function getDurationMs(durationSeconds: unknown) {
  const parsed =
    typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
      ? durationSeconds
      : 30;
  return Math.min(MAX_MUSIC_LENGTH_MS, Math.max(1000, Math.round(parsed * 1000)));
}

export async function POST(request: NextRequest) {
  try {
    const { supabaseUrl, anonKey, serviceRoleKey } = readRequiredEnv();
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

    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured." }, { status: 500 });
    }

    const body = (await request.json().catch(() => null)) as ElevenMusicBody | null;
    const title = String(body?.title || "").trim();
    const projectName = String(body?.projectName || title).trim() || title;
    const genre = String(body?.genre || "").trim();
    const prompt = String(body?.prompt || "").trim();
    const vocalMode = String(body?.vocalMode || "singing").trim();
    const lyrics = String(body?.lyrics || "").trim();
    const requestedTrackGroupId = String(body?.trackGroupId || "").trim();
    const requestedParentVersionId = String(body?.parentVersionId || "").trim();
    const trackGroupId = requestedTrackGroupId || randomUUID();
    const durationMs = getDurationMs(body?.durationSeconds);

    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }

    if (!prompt) {
      return NextResponse.json({ error: "Prompt or final direction is required." }, { status: 400 });
    }

    if (!lyrics) {
      return NextResponse.json({ error: "Lyrics are required." }, { status: 400 });
    }

    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);
    const hasRootVersionId = await columnExists(serviceClient, "track_versions", "root_version_id");
    const hasArtworkConcept = await columnExists(serviceClient, "track_versions", "artwork_concept");
    const hasGenerationIntent = await columnExists(serviceClient, "track_versions", "generation_intent");

    if (requestedTrackGroupId) {
      const { data: project, error: projectError } = await serviceClient
        .from("studio_projects")
        .select("user_id")
        .eq("track_group_id", requestedTrackGroupId)
        .maybeSingle<{ user_id: string }>();

      if (projectError) {
        return NextResponse.json({ error: projectError.message }, { status: 500 });
      }

      if (project?.user_id && project.user_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const elevenPrompt = buildElevenMusicPrompt({
      title,
      genre,
      prompt,
      vocalMode,
      lyrics,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120 * 1000);
    let audioBuffer: ArrayBuffer;

    try {
      const elevenResponse = await fetch(
        "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
        {
          method: "POST",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model_id: "music_v1",
            music_length_ms: durationMs,
            force_instrumental: false,
            prompt: elevenPrompt,
          }),
          signal: controller.signal,
        }
      );

      if (!elevenResponse.ok) {
        const errorText = await elevenResponse.text().catch(() => "");
        return NextResponse.json(
          {
            error: "Eleven Music generation failed.",
            provider: "eleven_music",
            status: elevenResponse.status,
            code: elevenResponse.statusText,
            message: errorText || `ElevenLabs failed with status ${elevenResponse.status}`,
          },
          { status: elevenResponse.status }
        );
      }

      audioBuffer = await elevenResponse.arrayBuffer();
    } catch (error: any) {
      if (error?.name === "AbortError") {
        return NextResponse.json(
          { error: "Eleven Music generation timed out after 120 seconds.", provider: "eleven_music" },
          { status: 504 }
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!audioBuffer.byteLength) {
      return NextResponse.json(
        { error: "Eleven Music returned an empty audio response.", provider: "eleven_music" },
        { status: 502 }
      );
    }

    const timestamp = Date.now();
    const storagePath = `ai-generated/eleven-music/${user.id}/${timestamp}-${sanitizePathPart(title)}.mp3`;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${SUPABASE_BUCKET}/${storagePath}`;
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "audio/mpeg",
        "x-upsert": "true",
      },
      body: audioBuffer,
    });
    const uploadText = await uploadResponse.text().catch(() => "");

    if (!uploadResponse.ok) {
      return NextResponse.json(
        {
          error: uploadText || `Singing version upload failed with status ${uploadResponse.status}`,
          provider: "eleven_music",
          storagePath,
        },
        { status: 500 }
      );
    }

    const audioUrl = `${supabaseUrl}/storage/v1/object/public/${SUPABASE_BUCKET}/${storagePath}`;

    const { data: existingProject, error: existingProjectError } = await serviceClient
      .from("studio_projects")
      .select("id")
      .eq("track_group_id", trackGroupId)
      .maybeSingle<{ id: string }>();

    if (existingProjectError) {
      return NextResponse.json({ error: existingProjectError.message }, { status: 500 });
    }

    const projectMutation = existingProject?.id
      ? serviceClient
          .from("studio_projects")
          .update({
            user_id: user.id,
            project_name: projectName,
          })
          .eq("id", existingProject.id)
      : serviceClient.from("studio_projects").insert({
          user_id: user.id,
          track_group_id: trackGroupId,
          project_name: projectName,
        });

    const { error: projectSaveError } = await projectMutation;

    if (projectSaveError) {
      return NextResponse.json({ error: projectSaveError.message }, { status: 500 });
    }

    const { data: latestVersion, error: latestError } = await serviceClient
      .from("track_versions")
      .select(hasRootVersionId ? "id,version_number,root_version_id,is_original" : "id,version_number,is_original")
      .eq("track_group_id", trackGroupId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; version_number: number | null; root_version_id?: string | null; is_original?: boolean | null }>();

    if (latestError) {
      return NextResponse.json({ error: latestError.message }, { status: 500 });
    }

    const nextVersionNumber = (latestVersion?.version_number || 0) + 1;
    const isOriginal = nextVersionNumber === 1;
    const versionId = randomUUID();
    const insertPayload: Record<string, unknown> = {
      id: versionId,
      generation_job_id: null,
      parent_version_id: isOriginal ? null : requestedParentVersionId || latestVersion?.id || null,
      track_group_id: trackGroupId,
      version_number: nextVersionNumber,
      title,
      version_label: isOriginal ? "Original" : `Singing Version ${nextVersionNumber}`,
      provider: "eleven_music",
      generation_mode: "singing",
      prompt: elevenPrompt,
      lyrics,
      vocal_mode: vocalMode || "singing",
      audio_url: audioUrl,
      artwork_url: body?.artworkUrl || null,
      storage_path: storagePath,
      duration: Math.round(durationMs / 1000),
      is_original: isOriginal,
    };

    if (hasRootVersionId) {
      insertPayload.root_version_id = isOriginal
        ? versionId
        : latestVersion?.root_version_id || latestVersion?.id || requestedParentVersionId || versionId;
    }

    if (hasGenerationIntent) {
      insertPayload.generation_intent = "new_version";
    }

    if (
      hasArtworkConcept &&
      body?.artworkConcept &&
      typeof body.artworkConcept === "object"
    ) {
      insertPayload.artwork_concept = body.artworkConcept;
    }

    const versionSelect = [
      "id",
      "parent_version_id",
      hasRootVersionId ? "root_version_id" : "",
      "track_group_id",
      "version_number",
      "title",
      "version_label",
      "provider",
      "generation_mode",
      hasGenerationIntent ? "generation_intent" : "",
      "prompt",
      "lyrics",
      "vocal_mode",
      "audio_url",
      "artwork_url",
      hasArtworkConcept ? "artwork_concept" : "",
      "storage_path",
      "duration",
      "is_original",
      "created_at",
    ]
      .filter(Boolean)
      .join(",");

    const { data: version, error: versionError } = await (serviceClient as any)
      .from("track_versions")
      .insert(insertPayload)
      .select(versionSelect)
      .single();

    if (versionError || !version) {
      return NextResponse.json(
        { error: versionError?.message || "Failed to save singing version" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      provider: "eleven_music",
      durationMs,
      audioUrl,
      storagePath,
      trackGroupId,
      trackVersionId: version.id,
      version,
    });
  } catch (error: any) {
    console.error("Studio Eleven Music unexpected error:", {
      message: error?.message || "Unexpected Studio Eleven Music error",
    });
    return NextResponse.json(
      {
        error: error?.message || "Unexpected Studio Eleven Music error",
        provider: "eleven_music",
      },
      { status: 500 }
    );
  }
}
