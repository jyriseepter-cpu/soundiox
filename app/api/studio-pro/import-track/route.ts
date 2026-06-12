import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const BUCKET = process.env.SUPABASE_BUCKET || "tracks";
const ALLOWED_EXTENSIONS = new Set(["mp3", "wav", "flac"]);
const CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.trim().toLowerCase() || "";
}

function stripAudioExtension(fileName: string) {
  return fileName.replace(/\.(mp3|wav|flac)$/i, "").trim();
}

async function columnExists(
  serviceClient: ReturnType<typeof buildServiceClient>,
  table: string,
  column: string
) {
  const { error } = await serviceClient.from(table).select(column).limit(1);
  return !error;
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

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    const sourceFilename = file.name;
    const extension = getExtension(sourceFilename);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: "Studio PRO imports support MP3, WAV, or FLAC files." },
        { status: 400 }
      );
    }

    const title =
      String(formData.get("title") || "").trim() ||
      stripAudioExtension(sourceFilename) ||
      "Studio PRO upload";
    const projectName = String(formData.get("projectName") || title).trim() || title;
    const genre = String(formData.get("genre") || "Electronic").trim() || "Electronic";
    const artist = String(formData.get("artist") || "SoundioX Artist").trim() || "SoundioX Artist";
    const notes = String(formData.get("notes") || "").trim();

    const serviceClient = buildServiceClient(supabaseUrl, serviceRoleKey);
    const trackGroupId = randomUUID();
    const safeFileName = slugify(sourceFilename.replace(/\.[^.]+$/, "")) || "studio-pro-import";
    const objectPath = `studio-pro-imports/${user.id}/${Date.now()}-${safeFileName}.${extension}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || CONTENT_TYPES[extension] || "application/octet-stream";

    const { error: uploadError } = await serviceClient.storage
      .from(BUCKET)
      .upload(objectPath, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = serviceClient.storage.from(BUCKET).getPublicUrl(objectPath);

    await serviceClient
      .from("studio_projects")
      .upsert(
        {
          user_id: user.id,
          track_group_id: trackGroupId,
          project_name: projectName,
        },
        { onConflict: "track_group_id" }
      );

    const versionId = randomUUID();
    const versionInsert: Record<string, unknown> = {
      id: versionId,
      generation_job_id: null,
      parent_version_id: null,
      track_group_id: trackGroupId,
      version_number: 1,
      title,
      version_label: "Original",
      provider: "studio-pro-upload",
      generation_mode: "import",
      prompt: notes || "Imported directly in Studio PRO.",
      lyrics: null,
      vocal_mode: null,
      audio_url: publicUrl,
      artwork_url: null,
      storage_path: objectPath,
      duration: null,
      is_original: true,
    };

    const hasRootVersionId = await columnExists(serviceClient, "track_versions", "root_version_id");
    if (hasRootVersionId) {
      versionInsert.root_version_id = versionId;
    }

    if (await columnExists(serviceClient, "track_versions", "imported_source")) {
      versionInsert.imported_source = "studio-pro-upload";
    }
    if (await columnExists(serviceClient, "track_versions", "source_filename")) {
      versionInsert.source_filename = sourceFilename;
    }
    if (await columnExists(serviceClient, "track_versions", "import_metadata")) {
      versionInsert.import_metadata = {
        source_filename: sourceFilename,
        imported_source: "studio-pro-upload",
        storage_path: objectPath,
      };
    }

    const versionSelect = hasRootVersionId
      ? "id,parent_version_id,root_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,prompt,audio_url,artwork_url,storage_path,duration,is_original,created_at,stems_status,stem_drums_url,stem_bass_url,stem_vocals_url,stem_other_url,stems_metadata"
      : "id,parent_version_id,track_group_id,version_number,title,version_label,provider,generation_mode,prompt,audio_url,artwork_url,storage_path,duration,is_original,created_at,stems_status,stem_drums_url,stem_bass_url,stem_vocals_url,stem_other_url,stems_metadata";

    const trackVersionsTable = (serviceClient as any).from("track_versions");
    const { data: version, error: versionError } = await trackVersionsTable
      .insert(versionInsert)
      .select(versionSelect)
      .single();

    if (versionError || !version) {
      return NextResponse.json(
        { error: versionError?.message || "Failed to create Studio PRO version" },
        { status: 500 }
      );
    }

    const trackInsert: Record<string, unknown> = {
      title,
      artist,
      genre,
      audio_url: publicUrl,
      artwork_url: null,
      user_id: user.id,
      is_published: false,
      is_promo: false,
      plays_all_time: 0,
      plays_this_month: 0,
    };

    if (await columnExists(serviceClient, "tracks", "source_track_version_id")) {
      trackInsert.source_track_version_id = version.id;
    }
    if (await columnExists(serviceClient, "tracks", "source_track_group_id")) {
      trackInsert.source_track_group_id = trackGroupId;
    }
    if (await columnExists(serviceClient, "tracks", "source_generation_mode")) {
      trackInsert.source_generation_mode = "import";
    }
    if (await columnExists(serviceClient, "tracks", "source_provider")) {
      trackInsert.source_provider = "studio-pro-upload";
    }
    if (await columnExists(serviceClient, "tracks", "source_version_label")) {
      trackInsert.source_version_label = "Original";
    }
    if (await columnExists(serviceClient, "tracks", "imported_source")) {
      trackInsert.imported_source = "studio-pro-upload";
    }
    if (await columnExists(serviceClient, "tracks", "source_filename")) {
      trackInsert.source_filename = sourceFilename;
    }
    if (await columnExists(serviceClient, "tracks", "import_metadata")) {
      trackInsert.import_metadata = {
        source_filename: sourceFilename,
        imported_source: "studio-pro-upload",
        storage_path: objectPath,
      };
    }

    const { data: draftTrack, error: draftError } = await serviceClient
      .from("tracks")
      .insert(trackInsert)
      .select("id")
      .single<{ id: string }>();

    if (draftError) {
      console.warn("Studio PRO import draft track insert warning:", draftError);
    }

    return NextResponse.json({
      ok: true,
      trackGroupId,
      trackVersionId: version.id,
      draftTrackId: draftTrack?.id || null,
      audioUrl: publicUrl,
      storagePath: `${BUCKET}/${objectPath}`,
      version,
    });
  } catch (error: any) {
    console.error("Studio PRO import unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected Studio PRO import error" },
      { status: 500 }
    );
  }
}
