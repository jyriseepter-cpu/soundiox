import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type VocalLayerBody = {
  trackVersionId?: string;
  trackGroupId?: string;
  audioUrl?: string;
  lyrics?: string;
  vocalMode?: string;
  title?: string;
};

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_MALE_VOICE_ID = process.env.ELEVENLABS_MALE_VOICE_ID;
const ELEVENLABS_FEMALE_VOICE_ID = process.env.ELEVENLABS_FEMALE_VOICE_ID;
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

function getVoiceId(vocalMode: string) {
  if (vocalMode === "male") return ELEVENLABS_MALE_VOICE_ID || "";
  if (vocalMode === "female") return ELEVENLABS_FEMALE_VOICE_ID || "";
  return "";
}

function normalizeVocalMode(value: string | null | undefined) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (normalized === "instrumental") return "instrumental";
  if (normalized === "auto-lyrics" || normalized === "auto lyrics") return "auto-lyrics";
  if (normalized === "write-lyrics" || normalized === "write lyrics") return "write-lyrics";
  if (normalized === "male" || normalized === "male-vocal" || normalized === "male vocal") return "male";
  if (normalized === "female" || normalized === "female-vocal" || normalized === "female vocal") return "female";
  if (normalized === "duet") return "duet";

  return "";
}

function safePathPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isMissingColumnError(error: any) {
  const values = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return values.some(
    (value) =>
      value.includes("column") ||
      value.includes("schema cache") ||
      value.includes("42703") ||
      value.includes("pgrst204")
  );
}

async function columnExists(
  serviceClient: ReturnType<typeof buildServiceClient>,
  table: string,
  column: string
) {
  const { error } = await serviceClient.from(table).select(column).limit(1);
  return !error;
}

async function maybeUpdateTrackVersionVocalUrl(args: {
  serviceClient: ReturnType<typeof buildServiceClient>;
  trackVersionId: string;
  trackGroupId: string;
  vocalUrl: string;
}) {
  if (!args.trackVersionId || !args.trackGroupId) {
    return { saved: false, warning: "Voiceover URL generated, but no track version was selected." };
  }

  const hasRootVersionId = await columnExists(args.serviceClient, "track_versions", "root_version_id");
  const hasVocalUrl = await columnExists(args.serviceClient, "track_versions", "vocal_url");
  const hasVoiceoverUrl = await columnExists(args.serviceClient, "track_versions", "voiceover_url");

  if (!hasVocalUrl && !hasVoiceoverUrl) {
    return {
      saved: false,
      warning:
        "Voiceover URL generated, but track_versions voiceover columns are not available yet.",
    };
  }

  const versionSelect = hasRootVersionId
    ? "id,parent_version_id,root_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,prompt,lyrics,vocal_mode,audio_url,artwork_url,storage_path,duration,is_original"
    : "id,parent_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,prompt,lyrics,vocal_mode,audio_url,artwork_url,storage_path,duration,is_original";
  const trackVersionsTable = (args.serviceClient as any).from("track_versions");
  const { data: targetVersion, error: targetError } = await trackVersionsTable
    .select(versionSelect)
    .eq("id", args.trackVersionId)
    .eq("track_group_id", args.trackGroupId)
    .maybeSingle();

  if (targetError) {
    return {
      saved: false,
      warning: "Voiceover URL generated, but the Studio version could not be checked.",
    };
  }

  if (!targetVersion) {
    return {
      saved: false,
      warning: "Voiceover URL generated, but the selected Studio version was not found.",
    };
  }

  const voiceoverUpdate: Record<string, unknown> = {};
  if (hasVocalUrl) voiceoverUpdate.vocal_url = args.vocalUrl;
  if (hasVoiceoverUrl) voiceoverUpdate.voiceover_url = args.vocalUrl;

  if (targetVersion.is_original) {
    const { data: latestVersion, error: latestError } = await args.serviceClient
      .from("track_versions")
      .select("version_number")
      .eq("track_group_id", args.trackGroupId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle<{ version_number: number | null }>();

    if (latestError) {
      return {
        saved: false,
        warning: "Voiceover URL generated, but the new voiceover version could not be numbered.",
      };
    }

    const nextVersionNumber = (latestVersion?.version_number || 0) + 1;
    const insertPayload: Record<string, unknown> = {
      parent_version_id: targetVersion.id,
      track_group_id: targetVersion.track_group_id,
      version_number: nextVersionNumber,
      title: targetVersion.title || "Voiceover Version",
      version_label: `Voiceover ${nextVersionNumber}`,
      provider: targetVersion.provider || "studio-voiceover",
      generation_mode: "voiceover_layer",
      prompt: targetVersion.prompt || "Voiceover layer derived from Original.",
      lyrics: targetVersion.lyrics || null,
      vocal_mode: targetVersion.vocal_mode || null,
      audio_url: targetVersion.audio_url,
      artwork_url: targetVersion.artwork_url || null,
      storage_path: targetVersion.storage_path || null,
      duration: targetVersion.duration ?? null,
      is_original: false,
      ...voiceoverUpdate,
    };

    if (hasRootVersionId) {
      insertPayload.root_version_id = targetVersion.root_version_id || targetVersion.id;
    }

    const newVersionSelect = hasRootVersionId
      ? "id,parent_version_id,root_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,prompt,vocal_mode,audio_url,artwork_url,storage_path,duration,is_original,created_at,vocal_url,voiceover_url"
      : "id,parent_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,prompt,vocal_mode,audio_url,artwork_url,storage_path,duration,is_original,created_at,vocal_url,voiceover_url";
    const { data: newVersion, error: insertError } = await trackVersionsTable
      .insert(insertPayload)
      .select(newVersionSelect)
      .single();

    if (insertError) {
      return {
        saved: false,
        warning: "Voiceover URL generated, but the derived voiceover version could not be created.",
      };
    }

    return {
      saved: true,
      warning: "Original is immutable. Voiceover was attached to a new derived version.",
      version: newVersion,
    };
  }

  const { error } = await args.serviceClient
    .from("track_versions")
    .update(voiceoverUpdate)
    .eq("id", args.trackVersionId)
    .eq("track_group_id", args.trackGroupId);

  if (error) {
    if (isMissingColumnError(error)) {
      return {
        saved: false,
        warning:
          "Voiceover URL generated, but track_versions voiceover columns are not available yet.",
      };
    }

    console.warn("Studio vocal track_versions update skipped:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    return {
      saved: false,
      warning: "Voiceover URL generated, but the Studio version could not be updated.",
    };
  }

  return { saved: true, warning: null };
}

async function verifyStudioProjectOwnership(args: {
  serviceClient: ReturnType<typeof buildServiceClient>;
  trackGroupId: string;
  userId: string;
}) {
  if (!args.trackGroupId) {
    return { canUpdate: true, warning: null };
  }

  const { data, error } = await args.serviceClient
    .from("studio_projects")
    .select("user_id")
    .eq("track_group_id", args.trackGroupId)
    .maybeSingle<{ user_id: string }>();

  if (error) {
    console.warn("Studio vocal ownership verification skipped:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    return {
      canUpdate: true,
      warning: "Could not verify Studio project ownership; saved voiceover URL with fallback.",
    };
  }

  if (!data) {
    return { canUpdate: true, warning: null };
  }

  if (data.user_id !== args.userId) {
    return {
      canUpdate: false,
      warning: "Studio project ownership mismatch; voiceover URL was not saved to the version.",
    };
  }

  return { canUpdate: true, warning: null };
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

    const body = (await request.json().catch(() => null)) as VocalLayerBody | null;
    const trackVersionId = String(body?.trackVersionId || "").trim();
    const trackGroupId = String(body?.trackGroupId || "").trim();
    const audioUrl = String(body?.audioUrl || "").trim();
    const lyrics = String(body?.lyrics || "").trim();
    const vocalMode = normalizeVocalMode(body?.vocalMode);
    const title = String(body?.title || "").trim();

    if (!lyrics) {
      return NextResponse.json({ error: "Lyrics are required for vocal generation." }, { status: 400 });
    }

    if (vocalMode !== "male" && vocalMode !== "female") {
      return NextResponse.json(
        { error: "Real vocal layer currently supports male or female voice only." },
        { status: 400 }
      );
    }

    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured." }, { status: 500 });
    }

    const voiceId = getVoiceId(vocalMode);
    if (!voiceId) {
      return NextResponse.json(
        { error: `ElevenLabs ${vocalMode} voice ID is not configured.` },
        { status: 500 }
      );
    }

    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);

    if (trackVersionId && trackGroupId) {
      const { data: version, error: versionError } = await serviceClient
        .from("track_versions")
        .select("id,track_group_id,audio_url")
        .eq("id", trackVersionId)
        .eq("track_group_id", trackGroupId)
        .maybeSingle<{ id: string; track_group_id: string; audio_url: string | null }>();

      if (versionError) {
        return NextResponse.json({ error: versionError.message }, { status: 500 });
      }

      if (!version) {
        return NextResponse.json({ error: "Track version not found." }, { status: 404 });
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60 * 1000);

    try {
      const elevenResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: lyrics,
            model_id: "eleven_multilingual_v2",
          }),
          signal: controller.signal,
        }
      );

      if (!elevenResponse.ok) {
        const errorText = await elevenResponse.text().catch(() => "");
        return NextResponse.json(
          { error: errorText || `ElevenLabs failed with status ${elevenResponse.status}` },
          { status: elevenResponse.status }
        );
      }

      const audioBuffer = await elevenResponse.arrayBuffer();
      const groupOrVersion = safePathPart(trackGroupId || trackVersionId || "unversioned");
      const timestamp = Date.now();
      const storagePath = `studio-vocals/${user.id}/${groupOrVersion}/${timestamp}.mp3`;
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
          { error: uploadText || `Vocal upload failed with status ${uploadResponse.status}` },
          { status: 500 }
        );
      }

      const vocalUrl = `${supabaseUrl}/storage/v1/object/public/${SUPABASE_BUCKET}/${storagePath}`;
      const warnings: string[] = [];

      const ownership = await verifyStudioProjectOwnership({
        serviceClient,
        trackGroupId,
        userId: user.id,
      });
      if (ownership.warning) warnings.push(ownership.warning);

      let versionUpdate: { saved: boolean; warning: string | null; version?: any } = {
        saved: false,
        warning: null,
      };
      if (ownership.canUpdate) {
        versionUpdate = await maybeUpdateTrackVersionVocalUrl({
          serviceClient,
          trackVersionId,
          trackGroupId,
          vocalUrl,
        });
        if (versionUpdate.warning) warnings.push(versionUpdate.warning);
      }

      return NextResponse.json({
        vocalUrl,
        voiceoverUrl: vocalUrl,
        storagePath,
        title,
        audioUrl,
        trackVersionId: versionUpdate.version?.id || trackVersionId || null,
        version: versionUpdate.version || null,
        versionUpdated: versionUpdate.saved,
        warning: warnings.length > 0 ? warnings.join(" ") : undefined,
      });
    } catch (error: any) {
      if (error?.name === "AbortError") {
        return NextResponse.json(
          { error: "ElevenLabs vocal generation timed out after 60 seconds." },
          { status: 504 }
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    console.error("Studio vocal layer unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected vocal layer error" },
      { status: 500 }
    );
  }
}
